<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

requirePost();

$body = readJsonBody();

$email = trim((string) ($body['email'] ?? ''));
$password = (string) ($body['password'] ?? '');

if ($email === '' || $password === '') {
    jsonResponse(['success' => false, 'message' => 'E-mail e palavra-passe são obrigatórios.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['success' => false, 'message' => 'E-mail inválido.']);
}

$pdo = getDB();

$stmt = $pdo->prepare('SELECT id, nome, email, password_hash FROM utilizadores WHERE email = ? LIMIT 1');
$stmt->execute([$email]);

$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    jsonResponse(['success' => false, 'message' => 'E-mail ou palavra-passe incorretos.']);
}

session_regenerate_id(true);

$_SESSION['user_id'] = (int) $user['id'];
$_SESSION['user_nome'] = $user['nome'];
$_SESSION['user_email'] = $user['email'];

jsonResponse([
    'success' => true,
    'user' => [
        'id' => (int) $user['id'],
        'nome' => $user['nome'],
        'email' => $user['email'],
    ],
]);