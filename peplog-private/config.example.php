<?php
declare(strict_types=1);

return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'CPANELUSER_peplog',
        'user' => 'CPANELUSER_peplogapp',
        'password' => '',
    ],
    'setup_key' => '',
    'initial_admin' => 'admin',
    'initial_user' => '',
    'timezone' => 'Europe/Ljubljana',
    'report_recipient' => '',
    'openai_api_key' => '',
    'analysis_model' => 'gpt-4.1-mini',
    'transcription_model' => 'gpt-4o-mini-transcribe',
    'smtp' => [
        'host' => '',
        'port' => 465,
        'encryption' => 'tls',
        'user' => '',
        'password' => '',
        'from' => '',
    ],
];
