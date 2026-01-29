<?php
/**
 * Pigeon Sync API
 * 
 * GET  /api/sync.php?address=xxx  - Retrieve encrypted blob
 * PUT  /api/sync.php              - Store encrypted blob
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Data directory (outside web root in production)
define('DATA_DIR', __DIR__ . '/../data/users/');

// Ensure data directory exists
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

// Validate address (32 hex chars)
function validateAddress($address) {
    return preg_match('/^[a-f0-9]{32}$/', $address);
}

// Get file path for address
function getFilePath($address) {
    return DATA_DIR . $address . '.json';
}

// GET - Retrieve encrypted blob
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $address = $_GET['address'] ?? '';
    
    if (!validateAddress($address)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid address']);
        exit;
    }
    
    $file = getFilePath($address);
    
    if (!file_exists($file)) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        exit;
    }
    
    $data = file_get_contents($file);
    echo $data;
    exit;
}

// PUT - Store encrypted blob
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit;
    }
    
    $address = $input['address'] ?? '';
    $cipher = $input['cipher'] ?? '';
    $nonce = $input['nonce'] ?? '';
    
    if (!validateAddress($address)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid address']);
        exit;
    }
    
    if (empty($cipher) || empty($nonce)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing cipher or nonce']);
        exit;
    }
    
    // Limit blob size (1MB max)
    if (strlen($cipher) > 1048576) {
        http_response_code(413);
        echo json_encode(['error' => 'Payload too large']);
        exit;
    }
    
    $file = getFilePath($address);
    $data = json_encode([
        'cipher' => $cipher,
        'nonce' => $nonce,
        'updated' => time()
    ]);
    
    if (file_put_contents($file, $data, LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Write failed']);
        exit;
    }
    
    echo json_encode(['ok' => true]);
    exit;
}

// Method not allowed
http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
