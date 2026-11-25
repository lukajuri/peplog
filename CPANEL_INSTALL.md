# Install Peplog in cPanel

Peplog runs from a subfolder of an existing HTTPS site. The ZIP contains a browser-facing folder named **peplog** and a private folder named **peplog-private**.

## 1. Create the database and its user

1. Sign in to cPanel. Open **Databases → Database Wizard**. Some cPanel interfaces call it **MySQL Database Wizard**.
2. For **New Database**, enter **peplog** after the prefix already shown, then click **Next Step**. Write down the full database name as displayed, such as **account_peplog**.
3. For **Username**, enter **peplogapp** after the prefix. Generate a strong password with **Password Generator**, keep it in your password manager, and click **Create User**. Write down the full database username as displayed, such as **account_peplogapp**.
4. On **Add User to the Database**, select **ALL PRIVILEGES** for this new dedicated database and click **Next Step** or **Make Changes**. This lets the installer create the tables and indexes. Review the completion screen for both full names.
5. Start with **localhost** and port **3306**. Use your host’s database address if it explicitly provides a different one. The Peplog setup page creates the tables automatically.

If you created the database and user separately, open **Manage My Databases**, find **Add User to Database**, select the dedicated pair, click **Add**, then assign **ALL PRIVILEGES** for that database.

[cPanel Database Wizard](https://docs.cpanel.net/cpanel/databases/database-wizard/)

## 2. Place the files

1. In **Domains**, find the existing site's domain. Note its **Document Root**. For the supplied package, use the root shown on the **example.com** row. The exact path depends on the addon domain configuration.
2. Open **File Manager → Home**. Upload the ZIP to the cPanel account’s home directory and choose **Extract** there. Turn on **Show Hidden Files** in File Manager Settings to see the included .htaccess files.
3. Keep **peplog-private** in the cPanel account’s home directory, alongside the public web directories. Its path should be **/home/CPANELUSER/peplog-private** on a typical account. Use the actual home path shown by File Manager.
4. Move the entire **peplog** folder into the addon domain’s document root. For example, if the root is **/home/account/addon-site**, the web folder ends up at **/home/account/addon-site/peplog**.
5. Confirm HTTPS works for the addon site. In **Software → MultiPHP Manager**, check that the domain uses PHP 8.5 with **pdo_mysql**, **mbstring**, **curl**, **openssl** and **fileinfo**. The app uses the PHP version of the domain.
6. Keep the private directory owner-accessible. On PHP-FPM running as your cPanel account, use **0700** for the top-level **peplog-private** folder and **0600** for **config.php**. Keep **peplog** and its directories traversable by the web server, typically **0755** for directories and **0644** for public files. Remove the uploaded ZIP from the account after extracting it.

[cPanel Domains and document roots](https://docs.cpanel.net/cpanel/domains/domains/) · [MultiPHP Manager](https://docs.cpanel.net/cpanel/software/multiphp-manager-for-cpanel/)

## 3. Edit the private configuration

In File Manager, copy **peplog-private/config.example.php** to **peplog-private/config.php** and edit the copy. Set the following fields.

| Field | Value |
| --- | --- |
| db host, port, name, user, password | Host and port from step 1, the full prefixed database and user names, and the database user password |
| setup_key | A new random secret of at least 24 characters. A 32-character random password is suitable. Keep it private and use it in the setup form. |
| initial_admin, initial_user | The supplied cPanel package includes the requested usernames. In the GitHub template, enter your usernames here before first setup. |
| timezone | Europe/Ljubljana by default. Individual users can change their time zone in Settings. |
| report_recipient | The supplied package includes the fixed report inbox. In a fresh GitHub copy, enter the single address to receive weekly and monthly reports. |
| openai_api_key | Paste your OpenAI project API key into this private file. Leave the supplied model names unless you want to use a different compatible model. |
| smtp host, port, encryption, user, password, from | For a cPanel mailbox, open **Email Accounts → Connect Devices** for the sending mailbox and copy its **Secure SSL/TLS** outgoing settings. Set **tls** for implicit TLS, normally port **465**, or **starttls** for a provider that specifies STARTTLS, normally port **587**. The SMTP user is usually the full sending address. The **from** address must be allowed by that account. |

The values are inside PHP single quotes. In a value, write a literal single quote as **\\'** and a literal backslash as **\\\\**. Keep the surrounding quotes and commas. After saving, **config.php** is the only place that needs the service passwords and key.

[cPanel email client settings](https://docs.cpanel.net/cpanel/email/set-up-mail-client/) · [OpenAI API key handling](https://developers.openai.com/api/docs/guides/production-best-practices)

## 4. Set the first two PINs

1. Visit the secure setup URL for the installed folder. For your addon domain, open **https://example.com/peplog/setup.php**.
2. Enter the setup key from the private configuration. The next screen shows the accounts specified in that file.
3. Choose a separate **6–12 digit PIN** for each account, then select **Create accounts**. The first account is administrator. The optional second account is a standard user and starts with product access and the weight chart off.
4. Open **https://example.com/peplog/** and sign in as the administrator. Under **Admin → Users**, select the standard user and turn on the products they may log. Use **Enable weight monitoring** to show the chart for that user. It is an independent switch for each account.
5. The installer creates a lock and checks the database for existing accounts. Use Admin to manage accounts after setup. The public home page shows the logo and sign-in, with the cookie notice available on first visit.

## 5. Enable scheduled summaries

1. Open **Advanced → Cron Jobs**. Use the **Once Per Minute** preset or enter an asterisk in all five schedule fields.
2. Use the command below. Replace **/home/CPANELUSER** with the real home path.

~~~sh
/opt/cpanel/ea-php85/root/usr/bin/php /home/CPANELUSER/peplog-private/bin/reports.php >> /home/CPANELUSER/peplog-private/reports.log 2>&1
~~~

3. Click **Add New Cron Job**. The PHP path shown is the EasyApache 4 convention for PHP 8.5. Where the host uses a different CLI path, use the PHP 8.5 path it provides. With cPanel Terminal access, run the same PHP/script command with **--check** to verify the database connection, tables and extensions without generating reports.
4. The worker checks each account's time zone. Weekly processing becomes due **Sunday at 23:59** and monthly processing becomes due **on the last calendar day at 23:59**. Delivery follows analysis and can take longer if an API or mail retry is needed. The Delivery card shows current status. If delivery is marked unconfirmed, check the destination inbox and SMTP logs before requeuing that report.

[cPanel Cron Jobs](https://docs.cpanel.net/cpanel/advanced/cron-jobs/) · [cPanel EasyApache PHP CLI path](https://support.cpanel.net/hc/en-us/articles/360050224413-How-to-run-PHP-commands-as-a-cPanel-user-via-Terminal)

## 6. Check the first login

- In a private browser window, visit **https://example.com/peplog/**. Check the essential-cookie popup and the sign-in page.
- Sign in as each account. In Admin, set the standard user’s product and chart permissions. The standard account should see only its granted products and its own journal.
- Try a sample observation, a weigh-in, a theme switch and a language change. Check the weight chart on the account where you enabled it.
- To try transcription, use **Voice note** on HTTPS. The microphone and audio-upload options send audio to OpenAI for transcription. Dictated text can also be pasted directly into the review field.

The notice in the journal explains the storage, transcription, analysis and fixed email delivery. The site uses an essential session cookie for sign-in and form protection. The cookie notice preference is stored in the browser.
