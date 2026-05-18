// ════════════════════════════════════════════════════════════════
//  Stickerverse — Gemini Imagen 3 シール画像生成
//  FlutterFlow Custom Action
//
//  貼り付け先: FlutterFlow > Custom Code > Custom Actions
//  前提条件:
//    - App Settings > Constants に "geminiApiKey" を登録済みであること
//    - pubspec.yaml に http: ^1.2.0 が追加済みであること
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
// ══════════════════════════════════════════════

/// Gemini Imagen API 呼び出し系例外の基底クラス
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
/// [retryAfter] が非null の場合は Retry-After ヘッダーの値
class RateLimitException extends StickerGenerationException {
  final Duration? retryAfter;

  const RateLimitException({this.retryAfter, String? details})
      : super('レート制限に達しました', details: details);
}

/// ネットワーク障害・タイムアウト
class NetworkException extends StickerGenerationException {
  const NetworkException({String? details})
      : super('ネットワークエラーが発生しました', details: details);
}

/// レスポンスの JSON パース失敗、または想定外の構造
class ParseException extends StickerGenerationException {
  const ParseException({String? details})
      : super('レスポンスの解析に失敗しました', details: details);
}

/// セーフティフィルターによる生成ブロック（HTTP 400 + safety フラグ）
class SafetyFilterException extends StickerGenerationException {
  const SafetyFilterException({String? details})
      : super('このテーマは生成できません', details: details);
}

// ══════════════════════════════════════════════
//  Gemini Imagen クライアント
// ══════════════════════════════════════════════

/// Gemini Imagen 3 API ラッパー。
///
/// [httpClient] を外部から渡すことでユニットテスト時にモック化できる。
/// 省略時は実際の [http.Client] を使用する。
class GeminiImagenClient {
  // ── 定数 ──────────────────────────────────
  static const _baseUrl   = 'https://generativelanguage.googleapis.com';
  static const _model     = 'imagen-3.0-generate-001';
  static const _apiVersion = 'v1beta';
  static const _timeout   = Duration(seconds: 30);

  // リトライ設定: 最大2回、指数バックオフ（1秒 → 3秒）
  static const _maxRetries   = 2;
  static const _initialBackoff = Duration(seconds: 1);
  static const _backoffMultiplier = 3;

  final String _apiKey;
  final http.Client _httpClient;

  GeminiImagenClient({
    required String apiKey,
    http.Client? httpClient,
  })  : _apiKey = apiKey,
        _httpClient = httpClient ?? http.Client();

  // ── 公開メソッド ───────────────────────────

  /// シール画像を [count] 枚生成し、base64エンコードPNG文字列のリストを返す。
  ///
  /// [prompt]      prompts/library/ の定義に従って組み立て済みのプロンプト
  /// [count]       生成枚数（デフォルト4枚、ユーザーが1枚選ぶUX前提）
  /// [aspectRatio] アスペクト比（デフォルト "1:1" = 1024×1024px）
  ///
  /// スローする例外:
  ///   [AuthException]         APIキー無効
  ///   [RateLimitException]    レート制限（リトライ済み）
  ///   [NetworkException]      ネットワーク障害（リトライ済み）
  ///   [ParseException]        レスポンスパース失敗
  ///   [SafetyFilterException] セーフティフィルターでブロック
  Future<List<String>> generateImages({
    required String prompt,
    int count = 4,
    String aspectRatio = '1:1',
  }) async {
    int attempt = 0;
    Duration backoff = _initialBackoff;

    while (true) {
      try {
        return await _doRequest(
          prompt: prompt,
          count: count,
          aspectRatio: aspectRatio,
        );
      } on RateLimitException catch (e) {
        // RateLimit はリトライ対象だが、上限に達したら再スロー
        if (attempt >= _maxRetries) {
          debugPrint('[GeminiImagen] リトライ上限到達。RateLimitException をスロー。');
          rethrow;
        }
        final wait = e.retryAfter ?? backoff;
        debugPrint(
          '[GeminiImagen] レート制限: ${wait.inSeconds}秒後リトライ '
          '(試行 ${attempt + 1}/$_maxRetries)',
        );
        await Future.delayed(wait);
        backoff = Duration(seconds: backoff.inSeconds * _backoffMultiplier);
        attempt++;
      } on NetworkException {
        if (attempt >= _maxRetries) {
          debugPrint('[GeminiImagen] リトライ上限到達。NetworkException をスロー。');
          rethrow;
        }
        debugPrint(
          '[GeminiImagen] ネットワーク障害: ${backoff.inSeconds}秒後リトライ '
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

  /// 1回分のHTTPリクエストを送り、パース済みのbase64リストを返す
  Future<List<String>> _doRequest({
    required String prompt,
    required int count,
    required String aspectRatio,
  }) async {
    final uri = Uri.parse(
      '$_baseUrl/$_apiVersion/models/$_model:predict?key=$_apiKey',
    );

    final requestBody = jsonEncode({
      'instances': [
        {'prompt': prompt},
      ],
      'parameters': {
        'sampleCount': count,
        'aspectRatio': aspectRatio,
        // 明らかに有害なコンテンツのみブロック（アート系プロンプトに配慮）
        'safetyFilterLevel': 'BLOCK_ONLY_HIGH',
        // 人物生成は禁止（シールアプリ用途ではキャラ生成で誤検知が多い）
        'personGeneration': 'DONT_ALLOW',
      },
    });

    final preview = prompt.length > 60
        ? '${prompt.substring(0, 60)}...'
        : prompt;
    debugPrint('[GeminiImagen] 生成開始: "$preview" ($count枚)');

    http.Response response;
    try {
      response = await _httpClient
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: requestBody,
          )
          .timeout(_timeout);
    } on TimeoutException {
      debugPrint('[GeminiImagen] ERROR: タイムアウト (${_timeout.inSeconds}秒)');
      throw const NetworkException(details: 'Request timed out after 30 seconds');
    } catch (e) {
      debugPrint('[GeminiImagen] ERROR: ネットワーク障害 - $e');
      throw NetworkException(details: e.toString());
    }

    debugPrint('[GeminiImagen] HTTP ${response.statusCode}');
    return _handleResponse(response);
  }

  /// HTTPステータスに応じて例外をスローするか、パース済みリストを返す
  List<String> _handleResponse(http.Response response) {
    switch (response.statusCode) {
      case 200:
        return _parseImages(response.body);

      case 400:
        final msg = _extractErrorMessage(response.body);
        debugPrint('[GeminiImagen] ERROR 400: $msg');
        // セーフティフィルターによるブロックか判定
        final lowerMsg = msg.toLowerCase();
        if (lowerMsg.contains('safety') ||
            lowerMsg.contains('block') ||
            lowerMsg.contains('content_filter') ||
            lowerMsg.contains('policy')) {
          throw SafetyFilterException(details: msg);
        }
        throw ParseException(details: '400 Bad Request: $msg');

      case 401:
      case 403:
        final msg = _extractErrorMessage(response.body);
        debugPrint('[GeminiImagen] ERROR ${response.statusCode}: 認証失敗 - $msg');
        throw AuthException(details: '${response.statusCode}: $msg');

      case 429:
        // Retry-After ヘッダーがあれば待機時間に使う
        final retryAfterSec = int.tryParse(
          response.headers['retry-after'] ?? '',
        );
        final retryAfter = retryAfterSec != null
            ? Duration(seconds: retryAfterSec)
            : null;
        debugPrint(
          '[GeminiImagen] ERROR 429: レート制限超過'
          '${retryAfter != null ? " (${retryAfter.inSeconds}秒後リトライ)" : ""}',
        );
        throw RateLimitException(
          retryAfter: retryAfter,
          details: '429 Too Many Requests',
        );

      case 500:
      case 502:
      case 503:
        final msg = _extractErrorMessage(response.body);
        debugPrint('[GeminiImagen] ERROR ${response.statusCode}: サーバーエラー - $msg');
        // サーバー側の一時障害はネットワーク扱いでリトライ
        throw NetworkException(
          details: '${response.statusCode} Server Error: $msg',
        );

      default:
        final msg = _extractErrorMessage(response.body);
        debugPrint('[GeminiImagen] ERROR ${response.statusCode}: 未知のエラー - $msg');
        throw NetworkException(
          details: '${response.statusCode} Unexpected: $msg',
        );
    }
  }

  /// 200レスポンスのJSONから base64 PNG 文字列のリストを抽出
  List<String> _parseImages(String responseBody) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;

      // トップレベルの blockedReason = 全枚数がセーフティフィルターでブロック
      if (json.containsKey('blockedReason')) {
        final reason = json['blockedReason'].toString();
        debugPrint('[GeminiImagen] 全枚数ブロック: $reason');
        throw SafetyFilterException(details: 'All images blocked: $reason');
      }

      final predictions = json['predictions'];
      if (predictions == null) {
        debugPrint('[GeminiImagen] ERROR: "predictions" フィールドが存在しない');
        throw const ParseException(details: '"predictions" field is missing');
      }
      if (predictions is! List || (predictions).isEmpty) {
        debugPrint('[GeminiImagen] ERROR: "predictions" が空リスト');
        throw const ParseException(details: '"predictions" is empty');
      }

      final images = <String>[];
      for (int i = 0; i < predictions.length; i++) {
        final pred = predictions[i];
        if (pred is! Map<String, dynamic>) {
          debugPrint('[GeminiImagen] WARN: predictions[$i] の型が不正。スキップ。');
          continue;
        }

        // 個別のセーフティフィルターブロック（一部の画像だけブロックされる場合）
        if (pred.containsKey('raiFilteredReason')) {
          debugPrint(
            '[GeminiImagen] WARN: predictions[$i] がフィルタリング済み: '
            '${pred['raiFilteredReason']}',
          );
          continue; // その画像だけスキップ、他は使えるので続行
        }

        final base64 = pred['bytesBase64Encoded'] as String?;
        if (base64 == null || base64.isEmpty) {
          debugPrint('[GeminiImagen] WARN: predictions[$i] の base64 が空。スキップ。');
          continue;
        }
        images.add(base64);
      }

      if (images.isEmpty) {
        // 全画像がフィルタリングされた（ただし HTTP 200 で返ってきたケース）
        throw const SafetyFilterException(
          details: 'All predictions were filtered',
        );
      }

      debugPrint('[GeminiImagen] 生成完了: ${images.length}枚 (要求: ${predictions.length}枚)');
      return images;
    } on StickerGenerationException {
      rethrow;
    } catch (e, st) {
      debugPrint('[GeminiImagen] ERROR パース失敗: $e\n$st');
      throw ParseException(details: e.toString());
    }
  }

  /// エラーレスポンスボディから人間が読めるメッセージを抽出
  String _extractErrorMessage(String responseBody) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;
      // Gemini API のエラー形式: { "error": { "message": "..." } }
      final errorObj = json['error'];
      if (errorObj is Map<String, dynamic>) {
        return errorObj['message']?.toString() ?? responseBody;
      }
      return responseBody;
    } catch (_) {
      // JSON でない場合はそのまま返す（最大200文字に切る）
      return responseBody.length > 200
          ? '${responseBody.substring(0, 200)}...'
          : responseBody;
    }
  }
}

// ══════════════════════════════════════════════
//  FlutterFlow エントリポイント
// ══════════════════════════════════════════════

/// シール画像を4枚生成し、base64エンコードPNG文字列のリストを返す。
///
/// [prompt] は prompts/library/ の定義に従って組み立て済みの文字列を渡すこと。
///
/// 戻り値のリストの各要素を画像として表示する方法:
/// ```dart
/// Image.memory(base64Decode(images[0]))
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
Future<List<String>> generateStickerImages(String prompt) async {
  final client = GeminiImagenClient(
    apiKey: FFAppConstants.geminiApiKey,
  );
  return client.generateImages(prompt: prompt);
}
