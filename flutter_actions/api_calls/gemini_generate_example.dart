// ════════════════════════════════════════════════════════════════
//  gemini_generate.dart — 使用例・テストパターン集
//
//  このファイルは FlutterFlow には貼り付けない。
//  ローカルでの動作確認やユニットテストの参照用。
//
//  実行:
//    dart run flutter_actions/api_calls/gemini_generate_example.dart
//
//  依存:
//    pubspec.yaml に以下を追加して `dart pub get` を実行すること
//      dependencies:
//        http: ^1.2.0
// ════════════════════════════════════════════════════════════════

// FlutterFlow なしで動かすため、必要なものだけインポート
import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart'; // dart pub add http --dev でインストール

// ──────────────────────────────────────────────────────────────
// gemini_generate.dart の FlutterFlow インポートブロックを除いた
// コアクラスをここで直接定義（テスト実行用）
// 本番では gemini_generate.dart の内容がFlutterFlowに貼り付けられる
// ──────────────────────────────────────────────────────────────

// NOTE: 実際のプロジェクトでは以下のようにインポートする
// import 'gemini_generate.dart'; （ただしFFインポートを除いた形で）

// ── ダミーのdebugPrint（Flutterなし環境用） ────────────────────
void debugPrint(String message) => print(message);

// ── gemini_generate.dart から例外クラスとクライアントをコピー ──
// （本番コードは gemini_generate.dart が正とする）

class StickerGenerationException implements Exception {
  final String message;
  final String? details;
  const StickerGenerationException(this.message, {this.details});
  @override
  String toString() => 'StickerGenerationException: $message'
      '${details != null ? '\n  details: $details' : ''}';
}

class AuthException extends StickerGenerationException {
  const AuthException({String? details})
      : super('APIキーが無効または未設定です', details: details);
}

class RateLimitException extends StickerGenerationException {
  final Duration? retryAfter;
  const RateLimitException({this.retryAfter, String? details})
      : super('レート制限に達しました', details: details);
}

class NetworkException extends StickerGenerationException {
  const NetworkException({String? details})
      : super('ネットワークエラーが発生しました', details: details);
}

class ParseException extends StickerGenerationException {
  const ParseException({String? details})
      : super('レスポンスの解析に失敗しました', details: details);
}

class SafetyFilterException extends StickerGenerationException {
  const SafetyFilterException({String? details})
      : super('このテーマは生成できません', details: details);
}

// GeminiImagenClient は gemini_generate.dart と完全に同一
// （テスト時は httpClient を MockClient で差し替える）
class GeminiImagenClient {
  static const _baseUrl    = 'https://generativelanguage.googleapis.com';
  static const _model      = 'imagen-3.0-generate-001';
  static const _apiVersion = 'v1beta';
  static const _timeout    = Duration(seconds: 30);
  static const _maxRetries = 2;
  static const _initialBackoff = Duration(seconds: 1);
  static const _backoffMultiplier = 3;

  final String _apiKey;
  final http.Client _httpClient;

  GeminiImagenClient({required String apiKey, http.Client? httpClient})
      : _apiKey = apiKey,
        _httpClient = httpClient ?? http.Client();

  Future<List<String>> generateImages({
    required String prompt,
    int count = 4,
    String aspectRatio = '1:1',
  }) async {
    int attempt = 0;
    Duration backoff = _initialBackoff;
    while (true) {
      try {
        return await _doRequest(prompt: prompt, count: count, aspectRatio: aspectRatio);
      } on RateLimitException catch (e) {
        if (attempt >= _maxRetries) rethrow;
        final wait = e.retryAfter ?? backoff;
        debugPrint('[GeminiImagen] レート制限: ${wait.inSeconds}秒後リトライ (試行 ${attempt + 1}/$_maxRetries)');
        await Future.delayed(wait);
        backoff = Duration(seconds: backoff.inSeconds * _backoffMultiplier);
        attempt++;
      } on NetworkException {
        if (attempt >= _maxRetries) rethrow;
        debugPrint('[GeminiImagen] ネットワーク障害: ${backoff.inSeconds}秒後リトライ (試行 ${attempt + 1}/$_maxRetries)');
        await Future.delayed(backoff);
        backoff = Duration(seconds: backoff.inSeconds * _backoffMultiplier);
        attempt++;
      }
    }
  }

  Future<List<String>> _doRequest({
    required String prompt,
    required int count,
    required String aspectRatio,
  }) async {
    final uri = Uri.parse(
      '$_baseUrl/$_apiVersion/models/$_model:predict?key=$_apiKey',
    );
    final requestBody = jsonEncode({
      'instances': [{'prompt': prompt}],
      'parameters': {
        'sampleCount': count,
        'aspectRatio': aspectRatio,
        'safetyFilterLevel': 'BLOCK_ONLY_HIGH',
        'personGeneration': 'DONT_ALLOW',
      },
    });
    http.Response response;
    try {
      response = await _httpClient
          .post(uri, headers: {'Content-Type': 'application/json'}, body: requestBody)
          .timeout(_timeout);
    } on TimeoutException {
      throw const NetworkException(details: 'Request timed out after 30 seconds');
    } catch (e) {
      throw NetworkException(details: e.toString());
    }
    return _handleResponse(response);
  }

  List<String> _handleResponse(http.Response response) {
    switch (response.statusCode) {
      case 200: return _parseImages(response.body);
      case 400:
        final msg = _extractErrorMessage(response.body);
        final lower = msg.toLowerCase();
        if (lower.contains('safety') || lower.contains('block') ||
            lower.contains('content_filter') || lower.contains('policy')) {
          throw SafetyFilterException(details: msg);
        }
        throw ParseException(details: '400 Bad Request: $msg');
      case 401: case 403:
        throw AuthException(details: '${response.statusCode}: ${_extractErrorMessage(response.body)}');
      case 429:
        final sec = int.tryParse(response.headers['retry-after'] ?? '');
        throw RateLimitException(
          retryAfter: sec != null ? Duration(seconds: sec) : null,
          details: '429 Too Many Requests',
        );
      default:
        throw NetworkException(details: '${response.statusCode}: ${_extractErrorMessage(response.body)}');
    }
  }

  List<String> _parseImages(String responseBody) {
    try {
      final json = jsonDecode(responseBody) as Map<String, dynamic>;
      if (json.containsKey('blockedReason')) {
        throw SafetyFilterException(details: 'All images blocked: ${json['blockedReason']}');
      }
      final predictions = json['predictions'];
      if (predictions == null || predictions is! List || (predictions).isEmpty) {
        throw const ParseException(details: '"predictions" is missing or empty');
      }
      final images = <String>[];
      for (final pred in predictions as List) {
        if (pred is! Map<String, dynamic>) continue;
        if (pred.containsKey('raiFilteredReason')) continue;
        final base64 = pred['bytesBase64Encoded'] as String?;
        if (base64 != null && base64.isNotEmpty) images.add(base64);
      }
      if (images.isEmpty) throw const SafetyFilterException(details: 'All predictions were filtered');
      return images;
    } on StickerGenerationException { rethrow; }
    catch (e) { throw ParseException(details: e.toString()); }
  }

  String _extractErrorMessage(String body) {
    try {
      final json = jsonDecode(body) as Map<String, dynamic>;
      final err = json['error'];
      if (err is Map<String, dynamic>) return err['message']?.toString() ?? body;
      return body;
    } catch (_) {
      return body.length > 200 ? '${body.substring(0, 200)}...' : body;
    }
  }
}

// ══════════════════════════════════════════════
//  モックレスポンス生成ヘルパー
// ══════════════════════════════════════════════

/// 成功レスポンス: n枚の base64 ダミー画像を含む JSON
String _successResponse(int count) {
  // 実際の base64 PNG の代わりに 1px 透明 PNG を使用
  const tiny1pxPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  final predictions = List.generate(
    count,
    (_) => {'bytesBase64Encoded': tiny1pxPng, 'mimeType': 'image/png'},
  );
  return jsonEncode({'predictions': predictions});
}

/// 部分ブロックレスポンス: n枚のうち先頭1枚がフィルタリング済み
String _partialFilterResponse(int count) {
  const tiny1pxPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  final predictions = <Map<String, dynamic>>[
    {'raiFilteredReason': 'SAFETY'},           // 1枚目はブロック
    ...List.generate(count - 1, (_) => {
      'bytesBase64Encoded': tiny1pxPng,
      'mimeType': 'image/png',
    }),
  ];
  return jsonEncode({'predictions': predictions});
}

/// エラーレスポンス: Gemini API の標準エラー形式
String _errorResponse(String message) =>
    jsonEncode({'error': {'message': message, 'status': 'INVALID_ARGUMENT'}});

// ══════════════════════════════════════════════
//  テストパターン
// ══════════════════════════════════════════════

/// 成功ケース: 4枚全て正常生成
Future<void> testSuccess() async {
  print('\n── テスト: 正常系（4枚生成） ──');

  final mockClient = MockClient((request) async {
    // リクエストの内容を検証
    final body = jsonDecode(request.body) as Map<String, dynamic>;
    final instances = body['instances'] as List;
    final params = body['parameters'] as Map<String, dynamic>;

    assert(instances.length == 1, 'instances は1件であること');
    assert(params['sampleCount'] == 4, 'sampleCount は4であること');
    assert(params['aspectRatio'] == '1:1', 'aspectRatio は 1:1 であること');
    assert(
      request.url.queryParameters['key'] == 'test_api_key',
      'APIキーがクエリパラメータに含まれること',
    );

    print('  → リクエスト検証OK: prompt="${(instances[0] as Map)['prompt']}"');
    return http.Response(_successResponse(4), 200);
  });

  final client = GeminiImagenClient(
    apiKey: 'test_api_key',
    httpClient: mockClient,
  );

  final images = await client.generateImages(
    prompt: 'fluffy white cat face, glossy 3D resin texture, die-cut sticker',
  );

  assert(images.length == 4, '4枚返ってくること');
  assert(images.every((b) => b.isNotEmpty), '全画像のbase64が非空であること');
  print('  ✓ ${images.length}枚取得成功（base64長: ${images[0].length}文字）');
}

/// 部分フィルタリング: 1枚ブロック → 3枚返る（エラーなし）
Future<void> testPartialFilter() async {
  print('\n── テスト: 部分フィルタリング（4枚中1枚ブロック） ──');

  final mockClient = MockClient(
    (_) async => http.Response(_partialFilterResponse(4), 200),
  );

  final client = GeminiImagenClient(
    apiKey: 'test_api_key',
    httpClient: mockClient,
  );

  final images = await client.generateImages(prompt: 'test prompt');
  assert(images.length == 3, 'ブロック分を除いた3枚が返ること');
  print('  ✓ ${images.length}枚取得（1枚フィルタリング済み）');
}

/// AuthException: 401 レスポンス
Future<void> testAuthError() async {
  print('\n── テスト: AuthException（HTTP 401） ──');

  final mockClient = MockClient(
    (_) async => http.Response(
      _errorResponse('API key not valid. Please pass a valid API key.'),
      401,
    ),
  );

  final client = GeminiImagenClient(
    apiKey: 'invalid_key',
    httpClient: mockClient,
  );

  try {
    await client.generateImages(prompt: 'test');
    assert(false, 'AuthException がスローされるはず');
  } on AuthException catch (e) {
    print('  ✓ AuthException: ${e.message}');
    print('    details: ${e.details}');
  }
}

/// RateLimitException: 429 → リトライ後も 429 → 例外スロー
Future<void> testRateLimit() async {
  print('\n── テスト: RateLimitException（429 × 3回） ──');

  int callCount = 0;
  final mockClient = MockClient((_) async {
    callCount++;
    print('  → API呼び出し $callCount 回目');
    return http.Response('', 429, headers: {'retry-after': '1'});
  });

  final client = GeminiImagenClient(
    apiKey: 'test_api_key',
    httpClient: mockClient,
  );

  try {
    await client.generateImages(prompt: 'test');
    assert(false, 'RateLimitException がスローされるはず');
  } on RateLimitException catch (e) {
    // 初回 + リトライ2回 = 計3回呼ばれること
    assert(callCount == 3, '初回+リトライ2回で計3回呼ばれること (実際: $callCount回)');
    print('  ✓ RateLimitException: ${e.message} ($callCount回試行)');
  }
}

/// SafetyFilterException: セーフティブロック
Future<void> testSafetyFilter() async {
  print('\n── テスト: SafetyFilterException（セーフティブロック） ──');

  final mockClient = MockClient((_) async => http.Response(
    _errorResponse('Image generation is blocked due to safety filters.'),
    400,
  ));

  final client = GeminiImagenClient(
    apiKey: 'test_api_key',
    httpClient: mockClient,
  );

  try {
    await client.generateImages(prompt: 'dangerous content');
    assert(false, 'SafetyFilterException がスローされるはず');
  } on SafetyFilterException catch (e) {
    print('  ✓ SafetyFilterException: ${e.message}');
  }
}

/// ParseException: 壊れた JSON レスポンス
Future<void> testParseError() async {
  print('\n── テスト: ParseException（不正JSON） ──');

  final mockClient = MockClient(
    (_) async => http.Response('{ broken json !!!', 200),
  );

  final client = GeminiImagenClient(
    apiKey: 'test_api_key',
    httpClient: mockClient,
  );

  try {
    await client.generateImages(prompt: 'test');
    assert(false, 'ParseException がスローされるはず');
  } on ParseException catch (e) {
    print('  ✓ ParseException: ${e.message}');
  }
}

/// NetworkException: タイムアウト
Future<void> testTimeout() async {
  print('\n── テスト: NetworkException（タイムアウト） ──');

  final mockClient = MockClient((_) async {
    // 実際のタイムアウト（30秒）を待つのはコストが高いので
    // Future.delayed で TimeoutException を模倣する
    await Future.delayed(const Duration(seconds: 35));
    return http.Response('', 200);
  });

  final client = GeminiImagenClient(
    apiKey: 'test_api_key',
    httpClient: mockClient,
  );

  // タイムアウト時間を短縮してテスト（直接 _doRequest は private なので
  // ここでは TimeoutException を throw するモックで代替検証する）
  final fastTimeoutMock = MockClient((_) async {
    throw TimeoutException('Simulated timeout', const Duration(seconds: 1));
  });

  final fastClient = GeminiImagenClient(
    apiKey: 'test_api_key',
    httpClient: fastTimeoutMock,
  );

  try {
    await fastClient.generateImages(prompt: 'test');
    assert(false, 'NetworkException がスローされるはず');
  } on NetworkException catch (e) {
    print('  ✓ NetworkException（タイムアウト）: ${e.message}');
    print('    details: ${e.details}');
  }
}

// ══════════════════════════════════════════════
//  FlutterFlow での使用例（コード断片）
// ══════════════════════════════════════════════

/// FlutterFlow の Action Flow Editor での使用イメージ（実行不可・参照用）
///
/// ```dart
/// // 1. プロンプトを組み立てる（Custom Function として定義）
/// final prompt = buildStickerPrompt(
///   subject: 'fluffy white cat face',
///   styleBlock: FFAppState().selectedStyle.styleBlock,
///   stickerBlock: 'die-cut sticker design, thick clean white border...',
///   qualityTags: 'high quality, sharp clean edges, vibrant colors...',
///   negative: '. Avoid: text, words, labels...',
/// );
///
/// // 2. 画像を生成する（Custom Action: gemini_generate.dart）
/// List<String> base64Images;
/// try {
///   base64Images = await generateStickerImages(prompt);
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
/// // 3. AppState に保存して選択画面へ遷移
/// FFAppState().update(() {
///   FFAppState().generatedImages = base64Images;
/// });
/// context.pushNamed('ImageSelectPage');
/// ```
///
/// 画像の表示方法（ImageSelectPage 内）:
/// ```dart
/// Image.memory(
///   base64Decode(FFAppState().generatedImages[index]),
///   fit: BoxFit.contain,
/// )
/// ```

// ══════════════════════════════════════════════
//  main: 全テストを順番に実行
// ══════════════════════════════════════════════

Future<void> main() async {
  print('════════════════════════════════════════');
  print('  gemini_generate.dart テストスイート');
  print('════════════════════════════════════════');

  await testSuccess();
  await testPartialFilter();
  await testAuthError();
  // NOTE: RateLimitException テストはリトライ待機（1+3秒）があるためやや遅い
  await testRateLimit();
  await testSafetyFilter();
  await testParseError();
  await testTimeout();

  print('\n════════════════════════════════════════');
  print('  全テスト完了');
  print('════════════════════════════════════════');
}
