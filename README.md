# Peplog

Private, multilingual journal for recording observations, past applications and weight. PHP 8.5, MySQL or MariaDB, a browser interface, and a CLI report worker for cPanel.

- Username and PIN authentication, with an administrator who can add users, reset PINs and grant individual products.
- Calendar, voice transcript review, light and dark themes, optional weight reminders and independent permissions for weight charts and OMRON BF511 tracking.
- Weekly and monthly snapshots with progress, tentative explanations and follow-up suggestions. OpenAI looks up public evidence separately and includes relevant references in the report and its email.
- English, Italian, Slovenian, Russian, Ukrainian, German, Spanish, French, Serbian and Croatian.

Place **peplog/** under the secure domain’s document root and **peplog-private/** in the cPanel account home, outside every web document root. Copy the private configuration template and fill in the deployment values there.

[Detailed cPanel installation and database setup](CPANEL_INSTALL.md)

[Add Advanced Weight Monitoring to an existing installation](UPGRADE_ADVANCED_WEIGHT.md)

[Add online evidence to reports on an existing installation](UPGRADE_AI_REPORTS.md)

The public repository carries the generic configuration template. Your deployment configuration, service credentials and journal data belong on the server.
