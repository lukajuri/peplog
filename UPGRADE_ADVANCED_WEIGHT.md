# Add Advanced Weight Monitoring to an existing Peplog site

This update keeps your existing accounts, PINs, product permissions, journal entries and saved reports. If you already added the `advanced_weight_monitor` column in an earlier update, start at step 3. If this is your first Advanced Weight Monitoring update, start at step 1. The new column defaults to off.

## 1. Back up your Peplog database

1. In cPanel, search for **phpMyAdmin** and open it.
2. In the left column, click your **existing Peplog database**. The full name is the value next to **name** in the **db** section of **peplog-private/config.php**. It may look like **account_peplog**. When you select it, you should see tables including **pl_users** and **pl_entries**.
3. With the database selected, click **Export** at the top. Choose **Quick** and **SQL**, then click **Export** or **Go**. Save the downloaded SQL file privately. It contains account and journal data.

[cPanel phpMyAdmin](https://docs.cpanel.net/cpanel/databases/phpmyadmin/) · [phpMyAdmin export help](https://docs.phpmyadmin.net/en/latest/import_export.html)

## 2. Add the advanced permission column

1. Keep the same database selected and click **SQL** at the top of phpMyAdmin.
2. Clear the SQL text box and paste these two lines.

~~~sql
ALTER TABLE `pl_users`
    ADD COLUMN `advanced_weight_monitor` TINYINT NOT NULL DEFAULT 0;
~~~

3. Click **Go** at the bottom to run it once. phpMyAdmin may say **MySQL returned an empty result set**. This is normal for a successful table change.
4. In the left column, click **pl_users**, then click **Structure**. Find **advanced_weight_monitor** in the list and confirm the **Default** is **0**. Zero means off. If the column is already present with this default, continue to file upload.

The query adds one column. It does not import a database or recreate any account or journal table. The ZIP includes the same query as **001_advanced_weight_monitor.sql** for reference.

[MySQL ALTER TABLE](https://dev.mysql.com/doc/refman/8.4/en/alter-table.html)

## 3. Upload the updated files

1. Download **Peplog_Advanced_Weight_Update.zip** and extract it on your computer.
2. In cPanel, open **Domains** and find the **Document Root** for your Peplog domain. Open that document root in **File Manager**.
3. Open each destination below in **File Manager**, click **Upload**, and select the files from the matching folder in the extracted ZIP. Allow cPanel to overwrite those specific files. Upload the files inside each folder to the listed destination.

| In the extracted ZIP | On the server |
| --- | --- |
| **peplog/assets/** · app.js, app.css | **[site document root]/peplog/assets/** |
| **peplog-private/** · locales.json, schema.sql | **[cPanel Home]/peplog-private/** |
| **peplog-private/src/** · journal.php, api.php, reporting.php, services.php | **[cPanel Home]/peplog-private/src/** |
| **peplog-private/bin/** · reports.php | **[cPanel Home]/peplog-private/bin/** |
| **peplog-private/views/** · head.php | **[cPanel Home]/peplog-private/views/** |

For a cPanel home directory of **/home/account**, the private folder is **/home/account/peplog-private**. Keep your existing **config.php** in place. The updated **schema.sql** file in the ZIP is for fresh installations. The only SQL needed for an existing site is in step 2, if the column is missing.

[cPanel Domains](https://docs.cpanel.net/cpanel/domains/domains/) · [cPanel File Manager](https://docs.cpanel.net/cpanel/files/file-manager/)

## 4. Turn on Advanced Weight Monitoring

1. Open Peplog, refresh the page with **Ctrl+F5** on Windows, and sign in as the administrator.
2. Go to **Admin → Users** and select a user. Turn on **Enable advanced weight monitoring** or **Enable weight monitoring**. Turning on either option switches the other off. If both were enabled in an earlier version, the user opens in advanced mode. Clear the enabled checkbox to hide weight monitoring for that user.
3. In that user's calendar, select a date and choose **Adv. log weight** for advanced monitoring or **Log weight** for standard monitoring. The form loads any weigh-in for the selected date and defaults to the last recorded weight when adding a new one.
4. Scroll, tap a number, or use the arrow keys on the rolling selectors. Weight, body fat and skeletal muscle have one decimal digit. Visceral fat level uses whole numbers. Select **Not recorded** for an unavailable BF511 reading.
5. Open **Advanced Weight Monitoring** and use **Weigh-in history** to edit readings later. Select a metric above the chart to see its recorded values over time.

Weekly and monthly reports list BF511 readings for advanced users. A metric with multiple readings shows its first-to-last change. Percentage changes are expressed in percentage points. English dates are shown day-first in the journal, entry forms and new report emails.
