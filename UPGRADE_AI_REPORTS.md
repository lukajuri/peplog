# Peplog update for weekly and monthly AI reports

Install this after the Privacy, Body Composition and Amounts update. This update needs no database changes. The existing cPanel cron job and private `config.php` provide the schedule, OpenAI API key and mail settings.

## Install in cPanel

1. Download and unzip `Peplog_AI_Report_Update.zip` on your computer.
2. Open **File Manager** in cPanel. Go to `/home/CPANELUSER/peplog-private/src/`. From the ZIP's `peplog-private/src` folder, upload `report_evidence.php` first, `reporting.php` second and `services.php` last. Confirm that you want to overwrite the two existing files.
3. In File Manager, go to `peplog/assets/` within your domain's document root. Upload `app.js` and `app.css` from the ZIP's `peplog/assets/` folder and confirm the replacements.
4. Reload the site with **Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac). The new analysis will appear in the next weekly or monthly report that Peplog generates. Previously completed reports keep their original text.

## What the reports include

Each report evaluates one user's progress and describes plausible explanations for benefits or side effects in the log. It ties the hypotheses to dated entries, considers other explanations and suggests concrete things to monitor or raise at the next progress review. It gives priority to human studies and official safety information. Relevant forum experiences are identified as anecdotes. Numbered links in the analysis and references in the email show where claims came from.

The public lookup uses the OpenAI API key already in `config.php` and sends only matching names and methods from `catalog.json`. Private journal observations and amounts go into the separate analysis request. Products added through the admin page receive a journal-based assessment when their name and method lack a match in the public catalog. If a search fails or provides no usable sources, the report still uses the journal. Web search uses additional OpenAI API credits.

If `analysis_model` in your private `config.php` is still `gpt-4.1-mini`, change that value to `gpt-5.4-mini` before the [scheduled January 2027 retirement](https://developers.openai.com/api/docs/deprecations). The separate web lookup already uses `gpt-5.4-mini`.
