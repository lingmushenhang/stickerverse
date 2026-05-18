// ════════════════════════════════════════════════════════════════
//  claude_write.dart — 使用例・テストパターン集
//
//  このファイルは FlutterFlow には貼り付けない。
//  ローカルでの動作確認やユニットテストの参照用。
//
//  実行:
//    dart run flutter_actions/api_calls/claude_write_example.dart
//
//  依存（pubspec.yaml に追加後 dart pub get を実行）:
//    dependencies:
//      http: ^1.2.0
// ════════════════════════════════════════════════════════════════

import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// FlutterFlow なし環境用のスタブ
void debugPrint(String msg) => print(msg);

// ── 例外クラス（claude_write.dart から抜粋）────────────────────
class StickerGenerationException implements Exception {
  final String message;
  final String? details;
  const StickerGenerationException(this.message, {this.details});
  @override
  String toString() =>
      'StickerGenerationException: $message'
      '${details != null ? '\n  details: $details' : ''}';
}
class AuthException extends StickerGenerationException {
  const AuthException({String? details}) : super('APIキーが無効または未設定です', details: details);
}
class RateLimitException extends StickerGenerationException {
  final Duration? retryAfter;
  const RateLimitException({this.retryAfter, String? details}) : super('レート制限に達しました', details: details);
}
class NetworkException extends StickerGenerationException {
  const NetworkException({String? details}) : super('ネットワークエラーが発生しました', details: details);
}
class ParseException extends StickerGenerationException {
  const ParseException({String? details}) : super('レスポンスの解析に失敗しました', details: details);
}
class SafetyFilterException extends StickerGenerationException {
  const SafetyFilterException({String? details}) : super('このテーマは生成できません', details: details);
}

// ── ClaudeWriteClient（claude_write.dart と同一実装） ─────────
class ClaudeWriteClient {
  static const _endpoint     = 'https://api.anthropic.com/v1/messages';
  static const _model        = 'claude-sonnet-4-6';
  static const _apiVersion   = '2023-06-01';
  static const _timeout      = Duration(seconds: 30);
  static const _maxTokens    = 500;
  static const _maxRetries        = 2;
  static const _initialBackoff    = Duration(seconds: 1);
  static const _backoffMultiplier = 3;

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

  ClaudeWriteClient({required String apiKey, http.Client? httpClient})
      : _apiKey = apiKey,
        _httpClient = httpClient ?? http.Client();

  Future<Map<String, String>> generateText({
    required String styleLabelJa,
    required String subject,
  }) async {
    int attempt = 0;
    Duration backoff = _initialBackoff;
    while (true) {
      try {
        return await _doRequest(styleLabelJa: styleLabelJa, subject: subject);
      } on RateLimitException catch (e) {
        if (attempt >= _maxRetries) rethrow;
        final wait = e.retryAfter ?? backoff;
        debugPrint('[ClaudeWrite] レート制限: ${wait.inMilliseconds}ms後リトライ (試行 ${attempt + 1}/$_maxRetries)');
        await Future.delayed(wait);
        backoff = Duration(seconds: backoff.inSeconds * _backoffMultiplier);
        attempt++;
      } on NetworkException {
        if (attempt >= _maxRetries) rethrow;
        debugPrint('[ClaudeWrite] ネットワーク障害: ${backoff.inSeconds}秒後リトライ (試行 ${attempt + 1}/$_maxRetries)');
        await Future.delayed(backoff);
        backoff = Duration(seconds: backoff.inSeconds * _backoffMultiplier);
        attempt++;
      }
    }
  }

  Future<Map<String, String>> _doRequest({
    required String styleLabelJa,
    required String subject,
  }) async {
    final uri = Uri.parse(_endpoint);
    final body = jsonEncode({
      'model': _model,
      'max_tokens': _maxTokens,
      'system': _systemPrompt,
      'messages': [{'role': 'user', 'content': 'スタイル: $styleLabelJa\nテーマ: $subject'}],
    });
    http.Response response;
    try {
      response = await _httpClient
          .post(uri, headers: {
            'x-api-key': _apiKey,
            'anthropic-version': _apiVersion,
            'content-type': 'application/json',
          }, body: body)
          .timeout(_timeout);
    } on TimeoutException {
      throw const NetworkException(details: 'Request timed out after 30 seconds');
    } catch (e) {
      throw NetworkException(details: e.toString());
    }
    return _handleResponse(response);
  }

  Map<String, String> _handleResponse(http.Response response) {
    switch (response.statusCode) {
      case 200: return _parseContent(response.body);
      case 400:
        final msg = _extractErrorMessage(response.body);
        final type = _extractErrorType(response.body);
        if (type == 'content_policy_violation' ||
            msg.toLowerCase().contains('safety') ||
            msg.toLowerCase().contains('policy')) {
          throw SafetyFilterException(details: msg);
        }
        throw ParseException(details: '400 invalid_request: $msg');
      case 401: case 403:
        throw AuthException(details: '${response.statusCode}: ${_extractErrorMessage(response.body)}');
      case 429:
        final ms = int.tryParse(response.headers['retry-after-ms'] ?? '');
        final sec = int.tryParse(response.headers['retry-after'] ?? '');
        throw RateLimitException(
          retryAfter: ms != null ? Duration(milliseconds: ms)
              : sec != null ? Duration(seconds: sec) : null,
          details: '429 rate_limit_error',
        );
      case 529:
        throw const NetworkException(details: '529 overloaded_error');
      default:
        throw NetworkException(details: '${response.statusCode}: ${_extractErrorMessage(response.body)}');
    }
  }

  Map<String, String> _parseContent(String responseBody) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;
      if ((json['stop_reason'] as String?) == 'max_tokens') {
        debugPrint('[ClaudeWrite] WARN: stop_reason=max_tokens（出力が不完全な可能性）');
      }
      final usage = json['usage'] as Map<String, dynamic>?;
      if (usage != null) {
        debugPrint('[ClaudeWrite] トークン使用量: 入力 ${usage['input_tokens']}tok / 出力 ${usage['output_tokens']}tok');
      }
      final content = json['content'] as List<dynamic>?;
      if (content == null || content.isEmpty) throw const ParseException(details: '"content" is empty');
      final block = content.firstWhere(
        (b) => b is Map<String, dynamic> && b['type'] == 'text', orElse: () => null,
      );
      if (block == null) throw const ParseException(details: 'No text block found');
      final text = (block as Map<String, dynamic>)['text'] as String? ?? '';
      return _extractJsonMap(text);
    } on StickerGenerationException { rethrow; }
    catch (e) { throw ParseException(details: e.toString()); }
  }

  Map<String, String> _extractJsonMap(String text) {
    final trimmed = text.trim();
    // 戦略1: そのままパース
    final direct = _tryParseJson(trimmed);
    if (direct != null) return direct;
    // 戦略2: マークダウンブロック除去
    final stripped = trimmed
        .replaceAll(RegExp(r'```json\s*', caseSensitive: false), '')
        .replaceAll(RegExp(r'```\s*'), '').trim();
    final fromMd = _tryParseJson(stripped);
    if (fromMd != null) return fromMd;
    // 戦略3: { ... } を正規表現で探す
    final match = RegExp(r'\{[^{}]*\}', dotAll: true).firstMatch(trimmed);
    if (match != null) {
      final extracted = _tryParseJson(match.group(0)!);
      if (extracted != null) return extracted;
    }
    throw ParseException(details: 'Could not extract JSON from: "${trimmed.substring(0, trimmed.length.clamp(0, 100))}"');
  }

  Map<String, String>? _tryParseJson(String text) {
    try {
      final json = jsonDecode(text);
      if (json is! Map<String, dynamic>) return null;
      final title = json['title'] as String?;
      final description = json['description'] as String?;
      if (title == null || title.isEmpty) return null;
      if (description == null || description.isEmpty) return null;
      return {'title': title, 'description': description};
    } catch (_) { return null; }
  }

  String _extractErrorMessage(String body) {
    try {
      final json = jsonDecode(body) as Map<String, dynamic>;
      return (json['error'] as Map<String, dynamic>?)?.['message']?.toString() ?? body;
    } catch (_) { return body.length > 200 ? '${body.substring(0, 200)}...' : body; }
  }

  String _extractErrorType(String body) {
    try {
      final json = jsonDecode(body) as Map<String, dynamic>;
      return (json['error'] as Map<String, dynamic>?)?.['type']?.toString() ?? 'unknown';
    } catch (_) { return 'unknown'; }
  }
}

// ══════════════════════════════════════════════
//  モックレスポンス生成ヘルパー
// ══════════════════════════════════════════════

/// 成功レスポンス（Anthropic Messages API 形式）
String _successResponse({
  String title = 'ぷにぷにの白猫ちゃん♡ふわふわ夢見る3Dシール',
  String description = 'まるでキャンディ！光を受けてキラキラ輝く3D樹脂風の白猫シール。手帳やスマホケースに貼るだけで一気に可愛さアップ♪',
  int inputTokens = 180,
  int outputTokens = 95,
}) => jsonEncode({
  'id': 'msg_test_01',
  'type': 'message',
  'role': 'assistant',
  'content': [
    {'type': 'text', 'text': jsonEncode({'title': title, 'description': description})},
  ],
  'model': 'claude-sonnet-4-6',
  'stop_reason': 'end_turn',
  'usage': {'input_tokens': inputTokens, 'output_tokens': outputTokens},
});

/// Claude がマークダウンコードブロックで包んで返した場合のレスポンス
String _markdownWrappedResponse() => jsonEncode({
  'id': 'msg_test_02',
  'type': 'message',
  'role': 'assistant',
  'content': [
    {
      'type': 'text',
      'text': '以下のJSONを生成しました：\n\n```json\n'
          '{"title": "きらきらホログラム蝶々シール", '
          '"description": "虹色に輝くホログラム蝶々。光の当たり方でまったく違う表情を見せる魔法のシール。"}\n```',
    },
  ],
  'model': 'claude-sonnet-4-6',
  'stop_reason': 'end_turn',
  'usage': {'input_tokens': 180, 'output_tokens': 60},
});

/// Anthropic 形式のエラーレスポンス
String _errorResponse(String type, String message) => jsonEncode({
  'type': 'error',
  'error': {'type': type, 'message': message},
});

// ══════════════════════════════════════════════
//  テストパターン
// ══════════════════════════════════════════════

/// 正常系: クリーンな JSON レスポンス
Future<void> testSuccess() async {
  print('\n── テスト: 正常系（クリーンJSON）──');

  final mockClient = MockClient((request) async {
    // リクエストのヘッダーと構造を検証
    assert(request.headers['x-api-key'] == 'test_key', 'x-api-key ヘッダーが必要');
    assert(request.headers['anthropic-version'] == '2023-06-01', 'anthropic-version ヘッダーが必要');
    assert(request.headers['content-type'] == 'application/json', 'content-type ヘッダーが必要');

    final body = jsonDecode(request.body) as Map<String, dynamic>;
    assert(body['model'] == 'claude-sonnet-4-6', 'モデルが正しいこと');
    assert(body['system'] != null, 'system フィールドが存在すること');
    final messages = body['messages'] as List;
    assert(messages.length == 1, 'メッセージが1件であること');

    final content = (messages[0] as Map)['content'] as String;
    print('  → リクエスト検証OK: "$content"');
    return http.Response(_successResponse(), 200);
  });

  final client = ClaudeWriteClient(apiKey: 'test_key', httpClient: mockClient);
  final result = await client.generateText(
    styleLabelJa: 'ぷにぷに',
    subject: '白猫',
  );

  assert(result.containsKey('title'), 'title キーが存在すること');
  assert(result.containsKey('description'), 'description キーが存在すること');
  assert(result['title']!.isNotEmpty, 'title が非空であること');
  assert(result['description']!.isNotEmpty, 'description が非空であること');
  print('  ✓ 成功: title="${result['title']}"');
  print('         description="${result['description']}"');
}

/// マークダウン除去: Claude が ```json で包んで返した場合
Future<void> testMarkdownWrapped() async {
  print('\n── テスト: マークダウン除去（```json ブロック）──');

  final mockClient = MockClient(
    (_) async => http.Response(_markdownWrappedResponse(), 200),
  );

  final client = ClaudeWriteClient(apiKey: 'test_key', httpClient: mockClient);
  final result = await client.generateText(
    styleLabelJa: 'うるちゅる',
    subject: '蝶々',
  );

  assert(result['title'] == 'きらきらホログラム蝶々シール', 'マークダウン除去後にtitleが取れること');
  assert(result['description']!.isNotEmpty, 'description が取れること');
  print('  ✓ マークダウン除去成功: title="${result['title']}"');
}

/// AuthException: 401 レスポンス
Future<void> testAuthError() async {
  print('\n── テスト: AuthException（HTTP 401）──');

  final mockClient = MockClient((_) async => http.Response(
    _errorResponse('authentication_error', 'invalid x-api-key'),
    401,
  ));

  final client = ClaudeWriteClient(apiKey: 'bad_key', httpClient: mockClient);
  try {
    await client.generateText(styleLabelJa: 'ぷにぷに', subject: '猫');
    assert(false, 'AuthException がスローされるはず');
  } on AuthException catch (e) {
    print('  ✓ AuthException: ${e.message}');
    print('    details: ${e.details}');
  }
}

/// RateLimitException: 429 + retry-after-ms ヘッダー（Anthropic形式）
Future<void> testRateLimit() async {
  print('\n── テスト: RateLimitException（429 + retry-after-ms）──');

  int callCount = 0;
  final mockClient = MockClient((_) async {
    callCount++;
    print('  → API呼び出し $callCount 回目');
    // Anthropic は retry-after-ms（ミリ秒）を返す
    return http.Response(
      _errorResponse('rate_limit_error', 'Rate limit exceeded'),
      429,
      headers: {'retry-after-ms': '1000'}, // 1秒（1000ms）
    );
  });

  final client = ClaudeWriteClient(apiKey: 'test_key', httpClient: mockClient);
  try {
    await client.generateText(styleLabelJa: 'ぷにぷに', subject: '猫');
    assert(false, 'RateLimitException がスローされるはず');
  } on RateLimitException catch (e) {
    assert(callCount == 3, '初回+リトライ2回で計3回呼ばれること (実際: $callCount回)');
    assert(e.retryAfter == const Duration(milliseconds: 1000), 'retryAfter が1000msであること');
    print('  ✓ RateLimitException: ${e.message}');
    print('    retryAfter: ${e.retryAfter?.inMilliseconds}ms ($callCount回試行)');
  }
}

/// NetworkException: 529 overloaded_error（Anthropic 固有）
Future<void> testOverloaded() async {
  print('\n── テスト: NetworkException（529 overloaded_error）──');

  int callCount = 0;
  final mockClient = MockClient((_) async {
    callCount++;
    return http.Response(
      _errorResponse('overloaded_error', 'Overloaded'),
      529,
    );
  });

  final client = ClaudeWriteClient(apiKey: 'test_key', httpClient: mockClient);
  try {
    await client.generateText(styleLabelJa: 'ぷにぷに', subject: '猫');
    assert(false, 'NetworkException がスローされるはず');
  } on NetworkException catch (e) {
    assert(callCount == 3, '529 はリトライされること');
    print('  ✓ NetworkException（529 overloaded）: ${e.message} ($callCount回試行)');
  }
}

/// ParseException: JSON キーが欠けている場合
Future<void> testMissingKey() async {
  print('\n── テスト: ParseException（JSON キー不足）──');

  // description キーなし
  final badJson = jsonEncode({'title': 'テストシール'});
  final responseBody = jsonEncode({
    'id': 'msg_test',
    'type': 'message',
    'role': 'assistant',
    'content': [{'type': 'text', 'text': badJson}],
    'model': 'claude-sonnet-4-6',
    'stop_reason': 'end_turn',
    'usage': {'input_tokens': 100, 'output_tokens': 20},
  });

  final mockClient = MockClient((_) async => http.Response(responseBody, 200));
  final client = ClaudeWriteClient(apiKey: 'test_key', httpClient: mockClient);

  try {
    await client.generateText(styleLabelJa: 'ぷにぷに', subject: '猫');
    assert(false, 'ParseException がスローされるはず');
  } on ParseException catch (e) {
    print('  ✓ ParseException（キー不足）: ${e.message}');
  }
}

/// ParseException: 完全に壊れたレスポンス
Future<void> testGibberish() async {
  print('\n── テスト: ParseException（解析不能なテキスト）──');

  final badResponse = jsonEncode({
    'id': 'msg_test',
    'type': 'message',
    'role': 'assistant',
    'content': [{'type': 'text', 'text': 'とても素敵なシールになりそうですね！JSON忘れました。'}],
    'model': 'claude-sonnet-4-6',
    'stop_reason': 'end_turn',
    'usage': {'input_tokens': 100, 'output_tokens': 20},
  });

  final mockClient = MockClient((_) async => http.Response(badResponse, 200));
  final client = ClaudeWriteClient(apiKey: 'test_key', httpClient: mockClient);

  try {
    await client.generateText(styleLabelJa: 'ぷにぷに', subject: '猫');
    assert(false, 'ParseException がスローされるはず');
  } on ParseException catch (e) {
    print('  ✓ ParseException（解析不能）: ${e.message}');
    print('    details: ${e.details}');
  }
}

// ══════════════════════════════════════════════
//  FlutterFlow での使用例（コード断片・参照用）
// ══════════════════════════════════════════════

/// FlutterFlow の Action Flow Editor での使用イメージ（実行不可・参照用）
///
/// 前提: generateStickerImages() で画像を選択済みで、
///       FFAppState().selectedStyle と FFAppState().currentSubject が設定済み
///
/// ```dart
/// // 1. スタイルの日本語ラベルを取得（AppStateから）
/// final styleLabelJa = FFAppState().selectedStyleLabelJa; // 例: "ぷにぷに"
/// final subject = FFAppState().currentSubject;            // 例: "白猫"
///
/// // 2. テキストを生成（Custom Action: claude_write.dart）
/// Map<String, String> stickerText;
/// try {
///   stickerText = await generateStickerText(styleLabelJa, subject);
/// } on SafetyFilterException {
///   showSnackBar('このテーマは生成できません。別のテーマを試してください。');
///   return;
/// } on RateLimitException {
///   showSnackBar('少し待ってから再試行してください。');
///   return;
/// } on AuthException {
///   showSnackBar('設定エラー。管理者にご連絡ください。');
///   return;
/// } on StickerGenerationException {
///   showSnackBar('エラーが発生しました。再試行してください。');
///   return;
/// }
///
/// // 3. AppState に保存してプレビュー画面へ
/// FFAppState().update(() {
///   FFAppState().stickerTitle = stickerText['title'] ?? '';
///   FFAppState().stickerDescription = stickerText['description'] ?? '';
/// });
/// context.pushNamed('PreviewPage');
/// ```
///
/// プレビュー画面での表示:
/// ```dart
/// Text(FFAppState().stickerTitle)       // シール名
/// Text(FFAppState().stickerDescription) // 説明文
/// ```

// ══════════════════════════════════════════════
//  main: 全テスト実行
// ══════════════════════════════════════════════

Future<void> main() async {
  print('════════════════════════════════════════');
  print('  claude_write.dart テストスイート');
  print('════════════════════════════════════════');

  await testSuccess();
  await testMarkdownWrapped();
  await testAuthError();
  // NOTE: RateLimit / Overloaded テストはリトライ待機があるためやや遅い
  await testRateLimit();
  await testOverloaded();
  await testMissingKey();
  await testGibberish();

  print('\n════════════════════════════════════════');
  print('  全テスト完了');
  print('════════════════════════════════════════');
}
