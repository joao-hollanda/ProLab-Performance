<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

requirePost();

$body = readJsonBody();

$nome = trim((string) ($body['nome'] ?? ''));
$email = trim((string) ($body['email'] ?? ''));
$password = (string) ($body['password'] ?? '');

if ($nome === '' || $email === '' || $password === '') {
    jsonResponse(['success' => false, 'message' => 'Todos os campos são obrigatórios.']);
}

if (strlen($nome) > 100) {
    jsonResponse(['success' => false, 'message' => 'Nome demasiado longo.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['success' => false, 'message' => 'E-mail inválido.']);
}

if (strlen($password) < 6) {
    jsonResponse(['success' => false, 'message' => 'A palavra-passe deve ter pelo menos 6 caracteres.']);
}

$pdo = getDB();

$check = $pdo->prepare('SELECT id FROM utilizadores WHERE email = ? LIMIT 1');
$check->execute([$email]);

if ($check->fetch()) {
    jsonResponse(['success' => false, 'message' => 'Este e-mail já está registado.']);
}

$hash = password_hash($password, PASSWORD_DEFAULT);

$pdo->beginTransaction();

$insertUser = $pdo->prepare('INSERT INTO utilizadores (nome, email, password_hash) VALUES (?, ?, ?)');
$insertUser->execute([$nome, $email, $hash]);

$userId = (int) $pdo->lastInsertId();

$insertProfile = $pdo->prepare('INSERT INTO perfis (utilizador_id) VALUES (?)');
$insertProfile->execute([$userId]);

$pdo->commit();

jsonResponse(['success' => true, 'message' => 'Conta criada com sucesso.']);