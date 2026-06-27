<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if (empty($_SESSION['user_id'])) {
    jsonResponse(['logged_in' => false]);
}

jsonResponse([
    'logged_in' => true,
    'user' => [
        'id' => (int) $_SESSION['user_id'],
        'nome' => $_SESSION['user_nome'],
        'email' => $_SESSION['user_email'],
    ],
]);