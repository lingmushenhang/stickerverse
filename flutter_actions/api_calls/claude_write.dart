// ════════════════════════════════════════════════════════════════
//  Stickerverse — Claude テキスト生成（シール名・説明文）
//  FlutterFlow Custom Action
//
//  貼り付け先: FlutterFlow > Custom Code > Custom Actions
//  前提条件:
//    - App Settings > Constants に "anthropicApiKey" を登録済みであること
//    - pubspec.yaml に http: ^1.2.0 が追加済みであること
//
//  ⚠️ FlutterFlow 統合注意（gemini_generate.dart と併用する場合）:
//    両ファイルを同じプロジェクトに貼ると例外クラスが重複してコンパイルエラーになる。
//    その場合は「例外クラス」セクション（StickerGenerationException 〜
//    SafetyFilterException）をこのファイルから削除すること。
//    index.dart 経由で gemini_generate.dart の定義が参照される。
//    このファイル単独で使うなら削除不要。
// ════════════════════════════════════════════════════════════════

// ── FlutterFlow 自動挿入インポート（削除・変更しないこと） ────────
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'index.dart';
import '/flutter_flow/custom_functions.dart';
import 'package:flutter/material.dart';
// ── カスタムコードここから ────────────────────────────────────────

import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

// ══════════════════════════════════════════════
//  例外クラス
//  ⚠️ gemini_generate.dart と共用。FF同時利用時はどちらか一方から削除。
// ══════════════════════════════════════════════

/// Stickerverse API 呼び出し系例外の基底クラス
class StickerGenerationException implements Exception {
  final String message;
  final String? details;

  const StickerGenerationException(this.message, {this.details});

  @override
  String toString() =>
      'StickerGenerationException: $message'
      '${details != null ? '\n  details: $details' : ''}';
}

/// APIキーが未設定・無効・期限切れ（HTTP 401 / 403）
class AuthException extends StickerGenerationException {
  const AuthException({String? details})
      : super('APIキーが無効または未設定です', details: details);
}

/// レート制限超過（HTTP 429）
/// [retryAfter] が非null の場合はサーバーが指示した待機時間
class RateLimitException extends StickerGenerationException {
  final Duration? retryAfter;

  const RateLimitException({this.retryAfter, String? details})
      : super('レート制限に達しました', details: details);
}

/// ネットワーク障害・タイムアウト・サーバーエラー
class NetworkException extends StickerGenerationException {
  const NetworkException({String? details})
      : super('ネットワークエラーが発生しました', details: details);
}

/// レスポンスの JSON パース失敗、または想定外の構造
class ParseException extends StickerGenerationException {
  const ParseException({String? details})
      : super('レスポンスの解析に失敗しました', details: details);
}

/// セーフティフィルターによる生成ブロック
class SafetyFilterException extends StickerGenerationException {
  const SafetyFilterException({String? details})
      : super('このテーマは生成できません', details: details);
}

// ══════════════════════════════════════════════
//  Claude Write クライアント
// ══════════════════════════════════════════════

/// Anthropic Claude API ラッパー（シール名・説明文生成専用）。
///
/// [httpClient] を外部から渡すことでユニットテスト時にモック化できる。
class ClaudeWriteClient {
  // ── API定数 ────────────────────────────────
  static const _endpoint     = 'https://api.anthropic.com/v1/messages';
  static const _model        = 'claude-sonnet-4-6';
  // Anthropic API バージョン（ヘッダー必須）
  static const _apiVersion   = '2023-06-01';
  static const _timeout      = Duration(seconds: 30);
  static const _maxTokens    = 500; // 日本語50字+100字 ≈ 300〜400トークン、余裕を持って設定

  // リトライ設定
  static const _maxRetries        = 2;
  static const _initialBackoff    = Duration(seconds: 1);
  static const _backoffMultiplier = 3;

  // ── システムプロンプト ──────────────────────
  // JSON のみを出力させる。前置き・マークダウン・説明文は不要と明示。
  static const _systemPrompt = '''あなたは日本のシール・グッズ通販専門のプロコピーライターです。

必ず下記のJSON形式のみを出力してください（前置き・後書き・マークダウン不要）:
{"title": "シール名", "description": "説明文"}

■ title（30〜50字）
・スタイルの質感を表す擬音語・擬態語を冒頭に（例: ぷにぷに、きらきら、うるうる）
・テーマと質感を掛け合わせたキャッチーな商品名
・購買意欲を高めるポジティブワードで締める

■ description（90〜110字）
・第一文: 質感・見た目の魅力を具体的かつ詩的に描写する
・第二文以降: 使いたくなる場面・感情を刺激する
・読点の多用を避け、テンポよく読める文体（体言止め活用可）''';

  final String _apiKey;
  final http.Client _httpClient;

  ClaudeWriteClient({
    required String apiKey,
    http.Client? httpClient,
  })  : _apiKey = apiKey,
        _httpClient = httpClient ?? http.Client();

  // ── 公開メソッド ───────────────────────────

  /// シール名と説明文を生成し、{"title": "...", "description": "..."} の Map を返す。
  ///
  /// [styleLabelJa] スタイルの日本語ラベル（例: "ぷにぷに"）
  /// [subject]      シールのテーマ（例: "白猫"）
  ///
  /// スローする例外:
  ///   [AuthException]         APIキー無効
  ///   [RateLimitException]    レート制限（リトライ済み）
  ///   [NetworkException]      ネットワーク障害（リトライ済み）
  ///   [ParseException]        レスポンスパース失敗
  ///   [SafetyFilterException] コンテンツポリシー違反
  Future<Map<String, String>> generateText({
    required String styleLabelJa,
    required String subject,
  }) async {
    int attempt = 0;
    Duration backoff = _initialBackoff;

    while (true) {
      try {
        return await _doRequest(
          styleLabelJa: styleLabelJa,
          subject: subject,
        );
      } on RateLimitException catch (e) {
        if (attempt >= _maxRetries) {
          debugPrint('[ClaudeWrite] リトライ上限到達。RateLimitException をスロー。');
          rethrow;
        }
        // Anthropic の retry-after は retryAfter フィールドに格納済み
        final wait = e.retryAfter ?? backoff;
        debugPrint(
          '[ClaudeWrite] レート制限: ${wait.inSeconds}秒後リトライ '
          '(試行 ${attempt + 1}/$_maxRetries)',
        );
        await Future.delayed(wait);
        backoff = Duration(seconds: backoff.inSeconds * _backoffMultiplier);
        attempt++;
      } on NetworkException {
        if (attempt >= _maxRetries) {
          debugPrint('[ClaudeWrite] リトライ上限到達。NetworkException をスロー。');
          rethrow;
        }
        debugPrint(
          '[ClaudeWrite] ネットワーク障害: ${backoff.inSeconds}秒後リトライ '
          '(試行 ${attempt + 1}/$_maxRetries)',
        );
        await Future.delayed(backoff);
        backoff = Duration(seconds: backoff.inSeconds * _backoffMultiplier);
        attempt++;
      }
      // AuthException / ParseException / SafetyFilterException はリトライ不要
    }
  }

  // ── 内部メソッド ───────────────────────────

  /// 1回分のHTTPリクエストを送り、パース済みのMapを返す
  Future<Map<String, String>> _doRequest({
    required String styleLabelJa,
    required String subject,
  }) async {
    final uri = Uri.parse(_endpoint);

    // ユーザープロンプト: スタイルとテーマをシンプルに渡す
    final userPrompt = 'スタイル: $styleLabelJa\nテーマ: $subject';

    final requestBody = jsonEncode({
      'model': _model,
      'max_tokens': _maxTokens,
      'system': _systemPrompt,
      'messages': [
        {'role': 'user', 'content': userPrompt},
      ],
    });

    debugPrint('[ClaudeWrite] 生成開始: style="$styleLabelJa", subject="$subject"');

    http.Response response;
    try {
      response = await _httpClient
          .post(
            uri,
            headers: {
              'x-api-key': _apiKey,
              'anthropic-version': _apiVersion,
              'content-type': 'application/json',
            },
            body: requestBody,
          )
          .timeout(_timeout);
    } on TimeoutException {
      debugPrint('[ClaudeWrite] ERROR: タイムアウト (${_timeout.inSeconds}秒)');
      throw const NetworkException(details: 'Request timed out after 30 seconds');
    } catch (e) {
      debugPrint('[ClaudeWrite] ERROR: ネットワーク障害 - $e');
      throw NetworkException(details: e.toString());
    }

    debugPrint('[ClaudeWrite] HTTP ${response.statusCode}');
    return _handleResponse(response);
  }

  /// HTTPステータスに応じて例外をスローするか、パース済みMapを返す
  Map<String, String> _handleResponse(http.Response response) {
    switch (response.statusCode) {
      case 200:
        return _parseContent(response.body);

      case 400:
        // invalid_request_error — プロンプトのポリシー違反を含む
        final msg = _extractErrorMessage(response.body);
        final errType = _extractErrorType(response.body);
        debugPrint('[ClaudeWrite] ERROR 400 ($errType): $msg');
        if (errType == 'content_policy_violation' ||
            msg.toLowerCase().contains('safety') ||
            msg.toLowerCase().contains('policy')) {
          throw SafetyFilterException(details: msg);
        }
        throw ParseException(details: '400 invalid_request: $msg');

      case 401:
      case 403:
        final msg = _extractErrorMessage(response.body);
        debugPrint('[ClaudeWrite] ERROR ${response.statusCode}: 認証失敗 - $msg');
        throw AuthException(details: '${response.statusCode}: $msg');

      case 429:
        // Anthropic は retry-after-ms（ミリ秒）を返す（Geminiの秒単位とは異なる）
        final retryAfterMs = int.tryParse(
          response.headers['retry-after-ms'] ?? '',
        );
        // retry-after（秒単位）のフォールバックも見る
        final retryAfterSec = int.tryParse(
          response.headers['retry-after'] ?? '',
        );
        final retryAfter = retryAfterMs != null
            ? Duration(milliseconds: retryAfterMs)
            : retryAfterSec != null
                ? Duration(seconds: retryAfterSec)
                : null;

        debugPrint(
          '[ClaudeWrite] ERROR 429: レート制限超過'
          '${retryAfter != null ? " (${retryAfter.inMilliseconds}ms後リトライ)" : ""}',
        );
        throw RateLimitException(
          retryAfter: retryAfter,
          details: '429 rate_limit_error',
        );

      case 500:
      case 502:
      case 503:
        final msg = _extractErrorMessage(response.body);
        debugPrint('[ClaudeWrite] ERROR ${response.statusCode}: サーバーエラー - $msg');
        throw NetworkException(details: '${response.statusCode} Server Error: $msg');

      case 529:
        // Anthropic 固有: API過負荷（一時的）。NetworkException としてリトライ。
        debugPrint('[ClaudeWrite] ERROR 529: API過負荷 (overloaded_error)');
        throw const NetworkException(details: '529 overloaded_error: API is temporarily overloaded');

      default:
        final msg = _extractErrorMessage(response.body);
        debugPrint('[ClaudeWrite] ERROR ${response.statusCode}: 未知のエラー - $msg');
        throw NetworkException(details: '${response.statusCode} Unexpected: $msg');
    }
  }

  /// 200レスポンスのJSONからテキストを取り出し、title/description を返す
  Map<String, String> _parseContent(String responseBody) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;

      // stop_reason が max_tokens の場合、出力が途中で打ち切られている可能性がある
      final stopReason = json['stop_reason'] as String?;
      if (stopReason == 'max_tokens') {
        debugPrint('[ClaudeWrite] WARN: stop_reason=max_tokens。出力が不完全な可能性がある。');
      }

      // トークン使用量をログ（コスト監視に使う）
      final usage = json['usage'] as Map<String, dynamic>?;
      if (usage != null) {
        debugPrint(
          '[ClaudeWrite] トークン使用量: '
          '入力 ${usage['input_tokens']}tok / '
          '出力 ${usage['output_tokens']}tok',
        );
      }

      // content 配列から type=text の最初の要素を取得
      final content = json['content'] as List<dynamic>?;
      if (content == null || content.isEmpty) {
        debugPrint('[ClaudeWrite] ERROR: "content" フィールドが空');
        throw const ParseException(details: '"content" field is missing or empty');
      }

      final textBlock = content.firstWhere(
        (block) => block is Map<String, dynamic> && block['type'] == 'text',
        orElse: () => null,
      );
      if (textBlock == null) {
        throw const ParseException(details: 'No text block found in content');
      }

      final text = (textBlock as Map<String, dynamic>)['text'] as String?;
      if (text == null || text.isEmpty) {
        throw const ParseException(details: 'text field is empty');
      }

      debugPrint('[ClaudeWrite] テキスト取得: "${text.substring(0, text.length.clamp(0, 80))}..."');

      // Claude の出力テキストから JSON を抽出
      return _extractJsonMap(text);
    } on StickerGenerationException {
      rethrow;
    } catch (e, st) {
      debugPrint('[ClaudeWrite] ERROR パース失敗: $e\n$st');
      throw ParseException(details: e.toString());
    }
  }

  /// Claude の出力テキストから {"title": "...", "description": "..."} を抽出。
  ///
  /// Claude が指示を守らずマークダウンや前置きを追加した場合でも動作するよう
  /// 3段階の抽出戦略を使う。
  Map<String, String> _extractJsonMap(String text) {
    final trimmed = text.trim();

    // 戦略1: テキストをそのままJSONとしてパース（Claude が正しく従った場合）
    final direct = _tryParseJson(trimmed);
    if (direct != null) return direct;

    // 戦略2: マークダウンコードブロック (```json ... ``` or ``` ... ```) を除去
    final stripped = trimmed
        .replaceAll(RegExp(r'```json\s*', caseSensitive: false), '')
        .replaceAll(RegExp(r'```\s*'), '')
        .trim();
    final fromMarkdown = _tryParseJson(stripped);
    if (fromMarkdown != null) return fromMarkdown;

    // 戦略3: テキスト中の最初の { ... } ブロックを正規表現で探す
    final jsonMatch = RegExp(r'\{[^{}]*\}', dotAll: true).firstMatch(trimmed);
    if (jsonMatch != null) {
      final extracted = _tryParseJson(jsonMatch.group(0)!);
      if (extracted != null) return extracted;
    }

    // 3戦略すべて失敗
    debugPrint('[ClaudeWrite] ERROR: JSON抽出失敗。テキスト: "$trimmed"');
    throw ParseException(
      details: 'Could not extract JSON from: "${trimmed.substring(0, trimmed.length.clamp(0, 100))}"',
    );
  }

  /// 文字列を JSON としてパースし、title / description を取り出す。
  /// パース失敗または必須キー不足の場合は null を返す。
  Map<String, String>? _tryParseJson(String text) {
    try {
      final json = jsonDecode(text);
      if (json is! Map<String, dynamic>) return null;

      final title = json['title'] as String?;
      final description = json['description'] as String?;

      // どちらかが欠けていたら失敗
      if (title == null || title.isEmpty) return null;
      if (description == null || description.isEmpty) return null;

      return {'title': title, 'description': description};
    } catch (_) {
      return null;
    }
  }

  /// Anthropic API のエラーレスポンスからメッセージを抽出。
  /// 形式: { "type": "error", "error": { "type": "...", "message": "..." } }
  String _extractErrorMessage(String responseBody) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;
      final errorObj = json['error'] as Map<String, dynamic>?;
      return errorObj?['message']?.toString()
          ?? responseBody.substring(0, responseBody.length.clamp(0, 200));
    } catch (_) {
      return responseBody.length > 200
          ? '${responseBody.substring(0, 200)}...'
          : responseBody;
    }
  }

  /// Anthropic API のエラータイプを抽出（例: "authentication_error"）。
  String _extractErrorType(String responseBody) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;
      final errorObj = json['error'] as Map<String, dynamic>?;
      return errorObj?['type']?.toString() ?? 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }
}

// ══════════════════════════════════════════════
//  FlutterFlow エントリポイント
// ══════════════════════════════════════════════

/// シール名と説明文を生成し、{"title": "...", "description": "..."} の Map を返す。
///
/// [styleLabelJa] styles.json の labels.ja フィールド（例: "ぷにぷに"）
/// [subject]      シールのテーマ（例: "白猫"、"桜"、"推しキャラ"）
///
/// 戻り値の使い方（FlutterFlow）:
/// ```dart
/// final title = result['title'] ?? '';
/// final description = result['description'] ?? '';
/// ```
///
/// エラー時の表示（FlutterFlow の Action Flow Editor でキャッチする）:
/// ```dart
/// on AuthException         → 「設定エラー。管理者にご連絡ください。」
/// on RateLimitException    → 「少し待ってから再試行してください。」
/// on NetworkException      → 「通信エラーが発生しました。再試行してください。」
/// on ParseException        → 「エラーが発生しました。再試行してください。」
/// on SafetyFilterException → 「このテーマは生成できません。別のテーマを試してください。」
/// ```
Future<Map<String, String>> generateStickerText(
  String styleLabelJa,
  String subject,
) async {
  final client = ClaudeWriteClient(
    apiKey: FFAppConstants.anthropicApiKey,
  );
  return client.generateText(
    styleLabelJa: styleLabelJa,
    subject: subject,
  );
}
