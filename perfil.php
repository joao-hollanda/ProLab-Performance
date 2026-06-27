<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$userId = requireLogin();
$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare('
        SELECT 
            u.nome,
            u.email,
            p.idade,
            p.peso_kg,
            p.altura_m,
            p.objetivo,
            p.nivel
        FROM perfis p
        INNER JOIN utilizadores u ON u.id = p.utilizador_id
        WHERE p.utilizador_id = ?
        LIMIT 1
    ');

    $stmt->execute([$userId]);
    $perfil = $stmt->fetch();

    jsonResponse([
        'success' => true,
        'perfil' => $perfil,
    ]);
}

requirePost();

$body = readJsonBody();

$idade = isset($body['idade']) && $body['idade'] !== '' ? (int) $body['idade'] : null;
$pesoKg = isset($body['peso_kg']) && $body['peso_kg'] !== '' ? (float) $body['peso_kg'] : null;
$alturaM = isset($body['altura_m']) && $body['altura_m'] !== '' ? (float) $body['altura_m'] : null;
$objetivo = isset($body['objetivo']) && $body['objetivo'] !== '' ? (string) $body['objetivo'] : null;
$nivel = isset($body['nivel']) && $body['nivel'] !== '' ? (string) $body['nivel'] : 'iniciante';

$objetivosValidos = ['hipertrofia', 'emagrecimento', 'resistencia', 'forca'];
$niveisValidos = ['iniciante', 'intermedio', 'avancado'];

if ($idade !== null && ($idade < 1 || $idade > 120)) {
    jsonResponse(['success' => false, 'message' => 'Idade inválida.']);
}

if ($pesoKg !== null && ($pesoKg <= 0 || $pesoKg > 400)) {
    jsonResponse(['success' => false, 'message' => 'Peso inválido.']);
}

if ($alturaM !== null && ($alturaM <= 0 || $alturaM > 2.80)) {
    jsonResponse(['success' => false, 'message' => 'Altura inválida.']);
}

if ($objetivo !== null && !in_array($objetivo, $objetivosValidos, true)) {
    jsonResponse(['success' => false, 'message' => 'Objetivo inválido.']);
}

if (!in_array($nivel, $niveisValidos, true)) {
    jsonResponse(['success' => false, 'message' => 'Nível inválido.']);
}

$stmt = $pdo->prepare('
    INSERT INTO perfis (utilizador_id, idade, peso_kg, altura_m, objetivo, nivel)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
        idade = VALUES(idade),
        peso_kg = VALUES(peso_kg),
        altura_m = VALUES(altura_m),
        objetivo = VALUES(objetivo),
        nivel = VALUES(nivel)
');

$stmt->execute([$userId, $idade, $pesoKg, $alturaM, $objetivo, $nivel]);

if ($pesoKg !== null) {
    $imc = null;

    if ($alturaM !== null && $alturaM > 0) {
        $imc = round($pesoKg / ($alturaM * $alturaM), 2);
    }

    $measure = $pdo->prepare('
        INSERT INTO medidas (utilizador_id, peso_kg, altura_m, imc)
        VALUES (?, ?, ?, ?)
    ');

    $measure->execute([$userId, $pesoKg, $alturaM, $imc]);
}

jsonResponse(['success' => true, 'message' => 'Perfil guardado com sucesso.']);