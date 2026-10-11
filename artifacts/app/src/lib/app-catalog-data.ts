/**
 * Built-in app catalog data: well-known apps, Windows display names, browser
 * site tokens and Android packages mapped to activity kinds.
 *
 * Generated once from the research draft (draft-2026-10-10, 187 entries) and
 * edited by hand from now on: this file is the source of truth. Hand-curated
 * facts (names, domains, package ids); no third-party list is copied (AdGuard,
 * nextdns and UT1 were only checklists). What each matcher means and the
 * order the classifier applies them in are documented in app-catalog.ts.
 *
 * `// verify` marks a package or site name that was not confirmed; a wrong
 * one never matches, so it is dead weight, not a misclassification.
 */
import type { CatalogEntry, CatalogGroup } from "@/lib/app-catalog";

/**
 * Ambiguous families: `default` is the kind used until the user answers
 * `ask_pl` once (the answer is stored as `app_classes.catalog_groups`),
 * `alt` the kinds offered next to it.
 */
export const CATALOG_GROUPS: Record<string, CatalogGroup> = {
  ai_chat: { default: "work", alt: ["learning"], ask_pl: "Czaty AI (ChatGPT, Claude, Gemini) to u Ciebie głównie praca czy nauka?" },
  shopping: {
    default: "neutral",
    alt: ["waste"],
    ask_pl: "Zakupy online (Allegro, OLX, AliExpress): sprawunek czy przeglądanie dla zabicia czasu?",
  },
  music: { default: "neutral", alt: ["watching"], ask_pl: "Muzyka (Spotify, YouTube Music): tło czy osobna rozrywka?" },
  news: { default: "waste", alt: ["neutral"], ask_pl: "Portale informacyjne (Onet, WP, Interia): strata czasu czy neutralne?" },
  books: { default: "learning", alt: ["neutral"], ask_pl: "E-booki i audiobooki: nauka czy relaks?" },
  reference: { default: "learning", alt: ["neutral", "waste"] },
  documents: { default: "neutral", alt: ["learning", "work"] },
  social_pro: { default: "waste", alt: ["work", "communication"] },
  film_db: { default: "waste", alt: ["watching"] },
  games: { default: "waste", alt: [] },
  // Opaque; consider leaving these for the user instead of guessing.
  phone_browser: { default: "neutral", alt: [] },
  finance: { default: "neutral", alt: [] },
  travel: { default: "neutral", alt: [] },
  errands: { default: "neutral", alt: ["waste"] },
};

export const CATALOG_ENTRIES: CatalogEntry[] = [
  // Biggest single ambiguity: the user's own label put Claude under work. Conversation tabs have no 'ChatGPT' in the title, so most web use
  // lands in 'Browser | other' regardless.
  {
    id: "chatgpt", name: "ChatGPT", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { pkg: ["com.openai.chatgpt"], app: ["Chatgpt", "ChatGPT"], site: ["ChatGPT"], domain: ["chatgpt.com", "chat.openai.com"] },
  },
  {
    id: "claude", name: "Claude", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { pkg: ["com.anthropic.claude"], app: ["Claude"], site: ["Claude"], domain: ["claude.ai"] },
  },
  {
    id: "gemini", name: "Gemini", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { pkg: ["com.google.android.apps.bard"], site: ["Google Gemini", "Gemini"], domain: ["gemini.google.com"] },
  },
  // Answer engine; used as search/research more than as a work tool.
  {
    id: "perplexity", name: "Perplexity", kind: "learning", group: "ai_chat", alt: ["work"],
    match: { pkg: ["ai.perplexity.app.android"], app: ["Perplexity"], site: ["Perplexity"], domain: ["perplexity.ai"] },
  },
  {
    id: "copilot", name: "Microsoft Copilot", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { pkg: ["com.microsoft.copilot"], app: ["Copilot"], site: ["Microsoft Copilot", "Copilot"], domain: ["copilot.microsoft.com"] },
  },
  // Homepage token is the tagline 'Into the Unknown'.
  {
    id: "deepseek", name: "DeepSeek", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { pkg: ["com.deepseek.chat"], site: ["DeepSeek", "Into the Unknown"], domain: ["chat.deepseek.com", "deepseek.com"] },
  },
  {
    id: "grok", name: "Grok", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { pkg: ["ai.x.grok"], site: ["Grok"], domain: ["grok.com"] },
  },
  // verify: package / site names not confirmed
  {
    id: "lechat", name: "Mistral Le Chat", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { pkg: ["ai.mistral.chat"], site: ["Le Chat"], domain: ["chat.mistral.ai"] },
  },
  // Token seen in data is the tagline 'Private, Uncensored AI'.
  {
    id: "venice", name: "Venice", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { site: ["Venice", "Private, Uncensored AI"], domain: ["venice.ai"] },
  },
  {
    id: "poe", name: "Poe", kind: "work", group: "ai_chat", alt: ["learning"],
    match: { pkg: ["com.poe.android"], site: ["Poe"], domain: ["poe.com"] },
  },
  // verify: package / site names not confirmed
  {
    id: "notebooklm", name: "NotebookLM", kind: "learning", group: "ai_chat", alt: ["work"],
    match: { pkg: ["com.google.android.apps.labs.language.tailwind"], site: ["NotebookLM"], domain: ["notebooklm.google.com"] },
  },
  // Role-play chat, entertainment rather than a tool.
  {
    id: "characterai", name: "Character.AI", kind: "waste",
    match: { pkg: ["ai.character.app"], site: ["Character.AI", "character.ai"], domain: ["character.ai"] },
  },
  {
    id: "elevenlabs", name: "ElevenLabs", kind: "work", alt: ["neutral"],
    match: { pkg: ["io.elevenlabs.coreapp"], app: ["Elevenlabs"], site: ["ElevenLabs"], domain: ["elevenlabs.io"] },
  },
  {
    id: "vscode", name: "VS Code", kind: "work",
    match: { app: ["Code"], site: ["Visual Studio Code"], domain: ["vscode.dev"] },
  },
  {
    id: "cursor", name: "Cursor", kind: "work",
    match: { app: ["Cursor"], domain: ["cursor.com"] },
  },
  {
    id: "windsurf", name: "Windsurf", kind: "work",
    match: { app: ["Windsurf"] },
  },
  {
    id: "zed", name: "Zed", kind: "work",
    match: { app: ["Zed"] },
  },
  {
    id: "jetbrains", name: "IDE JetBrains", kind: "work",
    match: { app: ["PyCharm", "IntelliJ IDEA", "WebStorm", "CLion", "Rider", "GoLand", "PhpStorm", "DataGrip", "RustRover"] },
  },
  {
    id: "visualstudio", name: "Visual Studio", kind: "work",
    match: { app: ["Visual Studio"] },
  },
  {
    id: "sublime", name: "Sublime Text / Notepad++", kind: "work", alt: ["neutral"],
    match: { app: ["Sublime Text", "Notepad++"] },
  },
  {
    id: "terminal", name: "Terminal / konsole", kind: "work",
    match: { app: ["Terminal", "PowerShell", "Command Prompt", "Wsl", "Ubuntu", "Console"] },
  },
  {
    id: "termux", name: "Termux", kind: "work",
    match: { pkg: ["com.termux"] },
  },
  {
    id: "docker", name: "Docker Desktop", kind: "work",
    match: { app: ["Docker Desktop"], domain: ["hub.docker.com"] },
  },
  {
    id: "postman", name: "Postman", kind: "work",
    match: { app: ["Postman"], site: ["Postman"], domain: ["postman.com"] },
  },
  // Repo file pages ('README.md at main · owner/repo') carry no 'GitHub'; the tracker then keys them 'owner/repo', hence token_re.
  {
    id: "github", name: "GitHub", kind: "work",
    match: {
      pkg: ["com.github.android"],
      app: ["Github Desktop", "GitHub Desktop"],
      site: ["GitHub"],
      domain: ["github.com"],
      token_re: ["^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$"],
    },
  },
  {
    id: "gitlab", name: "GitLab / Bitbucket", kind: "work",
    match: { site: ["GitLab", "Bitbucket"], domain: ["gitlab.com", "bitbucket.org"] },
  },
  // Homepage token is the tagline 'Where Developers Learn'.
  {
    id: "stackoverflow", name: "Stack Overflow", kind: "work", alt: ["learning"],
    match: {
      site: ["Stack Overflow", "Where Developers Learn", "Stack Exchange"],
      domain: ["stackoverflow.com", "stackexchange.com", "superuser.com", "serverfault.com"],
    },
  },
  {
    id: "supabase", name: "Supabase", kind: "work",
    match: { site: ["Supabase"], domain: ["supabase.com"] },
  },
  {
    id: "vercel", name: "Vercel / Netlify", kind: "work",
    match: { site: ["Vercel", "Netlify", "v0 by Vercel"], domain: ["vercel.com", "netlify.com", "v0.dev", "v0.app"] },
  },
  {
    id: "cloudflare", name: "Cloudflare", kind: "work",
    match: { site: ["Cloudflare"], domain: ["dash.cloudflare.com"] },
  },
  {
    id: "cloudconsoles", name: "Konsole chmurowe (GCP, Firebase, AWS, Azure)", kind: "work",
    match: {
      site: ["Google Cloud console", "Konsola Google Cloud", "Firebase console", "Firebase", "AWS Management Console", "Microsoft Azure"],
      domain: ["console.cloud.google.com", "console.firebase.google.com", "console.aws.amazon.com", "portal.azure.com"],
    },
  },
  {
    id: "aibuilders", name: "Kreatory aplikacji AI (Lovable, Replit, Bolt)", kind: "work",
    match: { app: ["Lovable"], site: ["Lovable", "Replit", "bolt.new"], domain: ["lovable.dev", "replit.com", "bolt.new"] },
  },
  {
    id: "llmconsoles", name: "Konsole API modeli AI (OpenRouter, OpenAI, Anthropic, Hugging Face)", kind: "work",
    match: {
      site: ["OpenRouter", "OpenAI Platform", "Claude Console", "Anthropic Console", "Hugging Face", "Google AI Studio"],
      domain: ["openrouter.ai", "platform.openai.com", "console.anthropic.com", "huggingface.co", "aistudio.google.com"],
    },
  },
  {
    id: "pkgregistries", name: "npm / PyPI", kind: "work",
    match: { site: ["npm", "PyPI"], domain: ["npmjs.com", "pypi.org"] },
  },
  {
    id: "analytics", name: "Analityka i SEO (Plausible, Google Analytics, Search Console)", kind: "work",
    match: {
      site: ["Plausible", "Google Analytics", "Search Console", "Google Search Console", "Tag Manager", "Google Tag Manager"],
      domain: ["plausible.io", "analytics.google.com", "search.google.com", "tagmanager.google.com"],
    },
  },
  // Must win over the shopping entries; segment equality keeps 'AliExpress Open Platform' apart from 'AliExpress'.
  {
    id: "devportals_pl", name: "Portale deweloperskie (Allegro, AliExpress)", kind: "work",
    match: {
      site: ["Allegro Developer Portal", "Allegro Developer Apps", "AliExpress Open Platform"],
      domain: ["developer.allegro.pl", "apps.developer.allegro.pl", "openservice.aliexpress.com"],
    },
  },
  {
    id: "stripe", name: "Stripe", kind: "work",
    match: { site: ["Stripe"], domain: ["dashboard.stripe.com"] },
  },
  {
    id: "jira", name: "Jira / Confluence", kind: "work",
    match: { pkg: ["com.atlassian.android.jira.core"], site: ["Jira", "Confluence"], domain: ["atlassian.net"] },
  },
  {
    id: "trello", name: "Trello", kind: "work",
    match: { pkg: ["com.trello"], app: ["Trello"], site: ["Trello"], domain: ["trello.com"] },
  },
  {
    id: "linear", name: "Linear / Asana / ClickUp", kind: "work",
    match: { app: ["Linear"], site: ["Linear", "Asana", "ClickUp"], domain: ["linear.app", "app.asana.com", "app.clickup.com"] },
  },
  {
    id: "todoist", name: "Todoist", kind: "work", alt: ["neutral"],
    match: { pkg: ["com.todoist"], app: ["Todoist"], site: ["Todoist"], domain: ["app.todoist.com", "todoist.com"] },
  },
  {
    id: "notion", name: "Notion", kind: "work",
    match: { pkg: ["notion.id"], app: ["Notion"], site: ["Notion"], domain: ["notion.so", "notion.site"] },
  },
  {
    id: "obsidian", name: "Obsidian", kind: "work", alt: ["learning"],
    match: { pkg: ["md.obsidian"], app: ["Obsidian"] },
  },
  {
    id: "figma", name: "Figma", kind: "work",
    match: { pkg: ["com.figma.mirror"], app: ["Figma"], site: ["Figma"], domain: ["figma.com"] },
  },
  {
    id: "miro", name: "Miro", kind: "work",
    match: { pkg: ["com.realtimeboard"], app: ["Miro"], site: ["Miro", "miro.com"], domain: ["miro.com"] },
  },
  {
    id: "canva", name: "Canva", kind: "work", alt: ["neutral"],
    match: { pkg: ["com.canva.editor"], app: ["Canva"], site: ["Canva"], domain: ["canva.com"] },
  },
  {
    id: "gdocs", name: "Google Docs", kind: "work",
    match: { pkg: ["com.google.android.apps.docs.editors.docs"], site: ["Google Docs", "Dokumenty Google"], domain: ["docs.google.com"] },
  },
  {
    id: "gsheets", name: "Google Sheets", kind: "work",
    match: { pkg: ["com.google.android.apps.docs.editors.sheets"], site: ["Google Sheets", "Arkusze Google"] },
  },
  {
    id: "gslides", name: "Google Slides", kind: "work",
    match: { pkg: ["com.google.android.apps.docs.editors.slides"], site: ["Google Slides", "Prezentacje Google"] },
  },
  {
    id: "gforms", name: "Google Forms", kind: "work",
    match: { site: ["Google Forms", "Formularze Google"], domain: ["forms.google.com"] },
  },
  {
    id: "gdrive", name: "Google Drive", kind: "work", alt: ["neutral"],
    match: { pkg: ["com.google.android.apps.docs"], site: ["Google Drive", "Dysk Google"], domain: ["drive.google.com"] },
  },
  {
    id: "word", name: "Microsoft Word", kind: "work",
    match: { pkg: ["com.microsoft.office.word"], app: ["Word"], site: ["Microsoft Word", "Word"] },
  },
  {
    id: "excel", name: "Microsoft Excel", kind: "work",
    match: { pkg: ["com.microsoft.office.excel"], app: ["Excel"], site: ["Microsoft Excel", "Excel"] },
  },
  // 'Prezentacja programu PowerPoint' is the default title of a new web deck.
  {
    id: "powerpoint", name: "Microsoft PowerPoint", kind: "work",
    match: {
      pkg: ["com.microsoft.office.powerpoint"],
      app: ["PowerPoint"],
      site: ["Microsoft PowerPoint", "PowerPoint", "Prezentacja programu PowerPoint"],
    },
  },
  {
    id: "onenote", name: "OneNote", kind: "work", alt: ["learning"],
    match: { pkg: ["com.microsoft.office.onenote"], app: ["OneNote"], site: ["OneNote"] },
  },
  {
    id: "m365", name: "Microsoft 365", kind: "work",
    match: {
      pkg: ["com.microsoft.office.officehubrow"],
      site: ["Microsoft 365", "Office"],
      domain: ["office.com", "m365.cloud.microsoft"],
    },
  },
  {
    id: "design_desktop", name: "Grafika / 3D (Blender, GIMP, Inkscape, Krita, Adobe)", kind: "work",
    match: {
      app: ["Blender", "Inkscape", "Krita", "Photoshop", "Illustrator", "Adobe Photoshop", "Adobe Illustrator"],
      app_prefix: ["Gimp"],
    },
  },
  {
    id: "video_edit", name: "Montaż wideo i audio", kind: "work", alt: ["neutral"],
    match: { pkg: ["com.lemon.lvoverseas"], app: ["Adobe Premiere Pro", "Resolve", "Audacity", "Capcut", "Clipchamp"] },
  },
  // For a cybersecurity student these are often coursework; the user's projects decide.
  {
    id: "netsec_tools", name: "Narzędzia sieciowe i bezpieczeństwa (Wireshark, Burp, VM, SSH)", kind: "work", alt: ["learning"],
    match: {
      app: [
        "Wireshark", "Burpsuite Community", "Burp Suite Community Edition", "Virtualbox", "Virtualboxvm", "Vmware", "Putty", "Winscp",
        "Filezilla",
      ],
    },
  },
  {
    id: "remote", name: "Pulpit zdalny", kind: "neutral", alt: ["work"],
    match: { app: ["Remote Desktop", "Teamviewer", "Anydesk"] },
  },
  {
    id: "grammar", name: "Grammarly / DeepL", kind: "neutral", alt: ["work", "learning"],
    match: {
      pkg: ["com.deepl.mobiletranslator", "com.grammarly.android.keyboard"],
      app: ["Grammarly", "Deepl"],
      site: ["DeepL Translate", "DeepL", "Grammarly"],
      domain: ["deepl.com", "app.grammarly.com"],
    },
  },
  // Seen in the user's data: lecture streams 'Transmisja - ... - CloudA'. 'Sklep CloudA' is a store page.
  {
    id: "clouda", name: "CloudA (platforma e-learningowa)", kind: "learning",
    match: { site: ["CloudA"] },
  },
  {
    id: "moodle", name: "Moodle / e-learning uczelni", kind: "learning",
    match: { site: ["Moodle", "eKursy", "e-Learning"], domain: ["moodle.org"] },
  },
  // verify: package / site names not confirmed
  {
    id: "usos", name: "USOSweb", kind: "learning",
    match: { pkg: ["pl.edu.usos.mobilny"], site: ["USOSweb", "USOS"], domain: ["usosweb.uw.edu.pl"] },
  },
  // verify: package / site names not confirmed
  {
    id: "librus", name: "Librus / Vulcan (dzienniki elektroniczne)", kind: "learning",
    match: {
      pkg: ["pl.librus.synergiaDru2"],
      site: ["Portal LIBRUS", "LIBRUS Synergia", "Synergia", "eduVULCAN", "Dziennik VULCAN"],
      domain: ["synergia.librus.pl", "eduvulcan.pl"],
    },
  },
  // 'Czytnik PWN' is its reader tab, seen in 'Browser | other'.
  {
    id: "ibuk", name: "IBUK Libra (czytelnia PWN)", kind: "learning",
    match: { site: ["IBUK Libra", "Czytnik PWN"], domain: ["libra.ibuk.pl", "ibuk.pl"] },
  },
  {
    id: "coursera", name: "Coursera", kind: "learning",
    match: { pkg: ["org.coursera.android"], site: ["Coursera", "Coursera Plus"], domain: ["coursera.org"] },
  },
  {
    id: "udemy", name: "Udemy", kind: "learning",
    match: { pkg: ["com.udemy.android"], site: ["Udemy"], domain: ["udemy.com"] },
  },
  {
    id: "edx", name: "edX / Khan Academy", kind: "learning",
    match: {
      pkg: ["org.edx.mobile", "org.khanacademy.android"],
      site: ["edX", "Khan Academy"],
      domain: ["edx.org", "khanacademy.org", "pl.khanacademy.org"],
    },
  },
  {
    id: "codelearn", name: "Nauka programowania (freeCodeCamp, LeetCode, W3Schools, Codecademy)", kind: "learning", alt: ["work"],
    match: {
      pkg: ["com.sololearn", "com.getmimo"],
      site: ["freeCodeCamp", "LeetCode", "W3Schools", "Codecademy", "GeeksforGeeks", "Exercism", "Sololearn"],
      domain: ["freecodecamp.org", "leetcode.com", "w3schools.com", "codecademy.com", "geeksforgeeks.org", "exercism.org"],
    },
  },
  {
    id: "docs", name: "Dokumentacja dla programistów (MDN itp.)", kind: "learning", alt: ["work"],
    match: { site: ["MDN Web Docs", "MDN"], domain: ["developer.mozilla.org", "docs.python.org", "learn.microsoft.com"] },
  },
  // Tailored: the user is in a WSB-NLU cybersecurity programme. TryHackMe's homepage token is its tagline.
  {
    id: "cyber_training", name: "Szkolenia z cyberbezpieczeństwa (THM, HTB, PortSwigger, NetAcad)", kind: "learning",
    match: {
      site: [
        "TryHackMe", "Cyber Security Training", "Hack The Box", "HTB Academy", "Web Security Academy", "PortSwigger", "OverTheWire",
        "picoCTF", "Cisco Networking Academy", "NetAcad", "Professor Messer", "OWASP",
      ],
      domain: [
        "tryhackme.com", "hackthebox.com", "academy.hackthebox.com", "portswigger.net", "overthewire.org", "picoctf.org", "netacad.com",
        "professormesser.com", "owasp.org",
      ],
    },
  },
  // Sekurak article titles carry no site suffix (checked), so only homepage visits match by title.
  {
    id: "sec_news", name: "Wiadomości o bezpieczeństwie (Sekurak, Niebezpiecznik, ZTS)", kind: "learning", alt: ["waste"],
    match: {
      site: ["Sekurak", "Niebezpiecznik", "Zaufana Trzecia Strona"],
      domain: ["sekurak.pl", "niebezpiecznik.pl", "zaufanatrzeciastrona.pl"],
    },
  },
  {
    id: "duolingo", name: "Duolingo", kind: "learning",
    match: { pkg: ["com.duolingo"], site: ["Duolingo"], domain: ["duolingo.com"] },
  },
  {
    id: "langapps", name: "Nauka języków (Babbel, Busuu, Memrise)", kind: "learning",
    match: {
      pkg: ["com.babbel.mobile.android.en", "com.busuu.android.enc", "com.memrise.android.memrisecompanion"],
      site: ["Babbel", "Busuu", "Memrise"],
      domain: ["babbel.com", "busuu.com", "memrise.com"],
    },
  },
  {
    id: "flashcards", name: "Fiszki (Anki, Quizlet)", kind: "learning",
    match: {
      pkg: ["com.ichi2.anki", "com.quizlet.quizletandroid"],
      app: ["Anki"],
      site: ["AnkiWeb", "Quizlet"],
      domain: ["ankiweb.net", "quizlet.com"],
    },
  },
  {
    id: "homework", name: "Pomoc w lekcjach (Brainly, Photomath)", kind: "learning",
    match: { pkg: ["co.brainly", "com.microblink.photomath"], site: ["Brainly", "Brainly.pl"], domain: ["brainly.pl", "brainly.com"] },
  },
  // PL main page is one segment with a space and falls into 'Browser | other' without the segment matcher.
  {
    id: "wikipedia", name: "Wikipedia", kind: "learning", group: "reference", alt: ["waste"],
    match: {
      pkg: ["org.wikipedia"],
      site: ["Wikipedia", "Wikipedia, wolna encyklopedia", "Wikisłownik", "Wiktionary"],
      domain: ["wikipedia.org", "wiktionary.org"],
    },
  },
  {
    id: "dictionaries", name: "Słowniki (Diki, SJP PWN, Cambridge)", kind: "learning", group: "reference", alt: ["neutral"],
    match: {
      site: ["Diki", "Cambridge Dictionary", "Merriam-Webster", "Słownik języka polskiego PWN", "SJP"],
      domain: ["diki.pl", "sjp.pwn.pl", "sjp.pl", "dictionary.cambridge.org", "merriam-webster.com"],
    },
  },
  {
    id: "scholar", name: "Wyszukiwarki naukowe (Scholar, arXiv, ResearchGate)", kind: "learning",
    match: {
      site: ["Google Scholar", "Google Scholar Search", "arXiv.org", "ResearchGate", "JSTOR"],
      domain: ["scholar.google.com", "arxiv.org", "researchgate.net", "jstor.org"],
    },
  },
  {
    id: "kaggle", name: "Kaggle", kind: "learning", alt: ["work"],
    match: { site: ["Kaggle"], domain: ["kaggle.com"] },
  },
  // Single-segment 'Google Translate' / 'Tłumacz Google' titles land in 'Browser | other' today.
  {
    id: "translate", name: "Tłumacz Google", kind: "neutral", group: "reference", alt: ["learning"],
    match: {
      pkg: ["com.google.android.apps.translate"],
      site: ["Google Translate", "Tłumacz Google"],
      domain: ["translate.google.com", "translate.google.pl"],
    },
  },
  // Reading counts toward the Mind pillar here; fiction listeners may prefer neutral.
  {
    id: "ebooks",
    name: "E-booki i audiobooki (Legimi, Storytel, BookBeat, Kindle, Audioteka, Empik Go)",
    kind: "learning",
    group: "books",
    alt: ["neutral"],
    match: {
      pkg: [
        "com.bookbeat.android", "grit.storytel.app", "com.amazon.kindle", "com.google.android.apps.books", "com.audioteka",
        "com.empik.empikgo", "com.legimi.android",
      ],
      app: ["Kindle"],
      site: ["Legimi online", "Legimi", "Storytel", "BookBeat", "Audioteka", "Empik Go"],
      domain: ["legimi.pl", "storytel.com", "bookbeat.com", "audioteka.com", "read.amazon.com"],
    },
  },
  // Lecture PDFs vs invoices: the file name in the title decides; let class keywords/rules override.
  {
    id: "pdf", name: "PDF i pliki lokalne", kind: "neutral", group: "documents", alt: ["learning", "work"],
    // "Local file": tracker 1.2's key for a file:// tab, in practice a PDF opened in the browser.
    match: { pkg: ["com.adobe.reader"], app: ["Acrobat", "Acrord32", "SumatraPDF", "Foxitpdfreader"], site: ["Local file"] },
  },
  {
    id: "gmail", name: "Gmail", kind: "communication",
    match: { pkg: ["com.google.android.gm"], site: ["Gmail"], domain: ["mail.google.com"] },
  },
  // 'Proton Mail: Sign-in' falls into 'Browser | other' (colon is not a tracker separator).
  {
    id: "protonmail", name: "Proton Mail", kind: "communication",
    match: { pkg: ["ch.protonmail.android"], site: ["Proton Mail", "Proton Mail: Sign-in"], domain: ["mail.proton.me"] },
  },
  {
    id: "outlook", name: "Outlook", kind: "communication",
    match: {
      pkg: ["com.microsoft.office.outlook"],
      app: ["Outlook", "Thunderbird", "Poczta", "Mail"],
      site: ["Outlook", "Outlook.com"],
      domain: ["outlook.live.com", "outlook.office.com"],
    },
  },
  // Listed so 'poczta.interia.pl' beats the 'interia.pl' news entry: domain matching must prefer the longest domain.
  {
    id: "pl_webmail", name: "Poczta WP / Onet / Interia / o2", kind: "communication",
    match: {
      site: ["Poczta WP", "Poczta Onet", "Poczta Interia", "Poczta o2"],
      domain: ["poczta.wp.pl", "poczta.onet.pl", "poczta.interia.pl", "poczta.o2.pl"],
    },
  },
  {
    id: "tuta", name: "Tuta Mail / K-9 / Thunderbird (telefon)", kind: "communication",
    match: {
      pkg: ["de.tutao.tutanota", "com.fsck.k9", "net.thunderbird.android"],
      site: ["Tuta Mail", "Tutanota"],
      domain: ["app.tuta.com"],
    },
  },
  // Browser keys for Discord DMs are '@name' / '#channel'; the title still contains 'Discord'.
  {
    id: "discord", name: "Discord", kind: "communication",
    match: { pkg: ["com.discord"], app: ["Discord"], site: ["Discord"], domain: ["discord.com"] },
  },
  {
    id: "slack", name: "Slack", kind: "communication",
    match: { pkg: ["com.Slack"], app: ["Slack"], site: ["Slack"], domain: ["app.slack.com"] },
  },
  // Today com.facebook.orca is counted as WASTE: the class keyword 'Facebook' hits the package name before the title 'Messenger'. Exact
  // package entries must run before keywords.
  {
    id: "messenger", name: "Messenger", kind: "communication",
    match: { pkg: ["com.facebook.orca"], app: ["Messenger"], site: ["Messenger"], domain: ["messenger.com"] },
  },
  {
    id: "whatsapp", name: "WhatsApp", kind: "communication",
    match: {
      pkg: ["com.whatsapp", "com.whatsapp.w4b"],
      app: ["WhatsApp", "Whatsapp.Root"],
      site: ["WhatsApp"],
      domain: ["web.whatsapp.com"],
    },
  },
  {
    id: "telegram", name: "Telegram", kind: "communication",
    match: {
      pkg: ["org.telegram.messenger", "org.telegram.messenger.web"],
      app: ["Telegram"],
      site: ["Telegram", "Telegram Web"],
      domain: ["web.telegram.org"],
    },
  },
  {
    id: "signal", name: "Signal", kind: "communication",
    match: { pkg: ["org.thoughtcrime.securesms"], app: ["Signal"] },
  },
  // Lectures held in Teams count as communication unless a rule says otherwise.
  {
    id: "teams", name: "Microsoft Teams", kind: "communication", alt: ["learning", "work"],
    match: { pkg: ["com.microsoft.teams"], app: ["Teams"], site: ["Microsoft Teams"], domain: ["teams.microsoft.com", "teams.live.com"] },
  },
  {
    id: "zoom", name: "Zoom", kind: "communication",
    match: { pkg: ["us.zoom.videomeetings"], app: ["Zoom"], site: ["Zoom"], domain: ["zoom.us"] },
  },
  // Meeting tabs are 'Meet - abc-defg-hij'; segment 'Meet' matches.
  {
    id: "meet", name: "Google Meet / Chat", kind: "communication",
    match: {
      pkg: ["com.google.android.apps.tachyon"],
      site: ["Google Meet", "Meet", "Google Chat"],
      domain: ["meet.google.com", "chat.google.com"],
    },
  },
  {
    id: "skype_viber", name: "Skype / Viber", kind: "communication",
    match: { pkg: ["com.skype.raider", "com.viber.voip"], app: ["Skype", "Viber"] },
  },
  // Seen in the user's data, phone and web.
  {
    id: "slowly", name: "Slowly (korespondencja)", kind: "communication",
    match: { pkg: ["com.slowlyapp"], site: ["Slowly", "Penpal Story"], domain: ["web.slowly.app"] },
  },
  // Workspace hosts; the tracker keys a named workspace by its own name, bare 'Rambox' is the host window.
  {
    id: "rambox", name: "Rambox / Franz / Ferdium", kind: "communication",
    match: { app: ["Rambox", "Franz", "Ferdi", "Ferdium", "Station"] },
  },
  // 108 min in the user's data. On MIUI the dialer lives in com.android.contacts; in-call screens are incallui.
  {
    id: "phone_calls", name: "Telefon (połączenia i kontakty)", kind: "communication",
    match: {
      pkg: [
        "com.google.android.dialer", "com.android.dialer", "com.samsung.android.dialer", "com.android.incallui",
        "com.samsung.android.incallui", "com.android.server.telecom", "com.android.contacts", "com.google.android.contacts",
      ],
    },
  },
  {
    id: "sms", name: "SMS / RCS", kind: "communication",
    match: { pkg: ["com.google.android.apps.messaging", "com.android.mms", "com.samsung.android.messaging"] },
  },
  // Feed scrolling vs job hunting / networking.
  {
    id: "linkedin", name: "LinkedIn", kind: "waste", group: "social_pro", alt: ["work", "communication"],
    match: { pkg: ["com.linkedin.android"], site: ["LinkedIn"], domain: ["linkedin.com"] },
  },
  {
    id: "dating", name: "Randki (Tinder, Badoo)", kind: "waste", alt: ["communication"],
    match: { pkg: ["com.tinder", "com.badoo.mobile"], site: ["Tinder"], domain: ["tinder.com"] },
  },
  // Watching unless the title says otherwise: a later title-keyword pass (kurs, tutorial, wykład, lecture) can move a video to learning.
  {
    id: "youtube", name: "YouTube", kind: "watching",
    match: {
      pkg: ["com.google.android.youtube", "app.revanced.android.youtube", "org.schabi.newpipe", "com.google.android.apps.youtube.kids"],
      site: ["YouTube"],
      domain: ["youtube.com", "youtu.be"],
    },
  },
  {
    id: "netflix", name: "Netflix", kind: "watching",
    match: { pkg: ["com.netflix.mediaclient"], app: ["Netflix"], site: ["Netflix"], domain: ["netflix.com"] },
  },
  {
    id: "max", name: "HBO Max", kind: "watching",
    match: { pkg: ["com.wbd.stream", "com.hbo.hbonow"], site: ["HBO Max", "Max"], domain: ["max.com", "hbomax.com"] },
  },
  {
    id: "disney", name: "Disney+", kind: "watching",
    match: { pkg: ["com.disney.disneyplus"], site: ["Disney+"], domain: ["disneyplus.com"] },
  },
  {
    id: "primevideo", name: "Prime Video", kind: "watching",
    match: { pkg: ["com.amazon.avod.thirdpartyclient"], site: ["Prime Video", "Amazon Prime Video"], domain: ["primevideo.com"] },
  },
  // verify: package / site names not confirmed
  {
    id: "skyshowtime", name: "SkyShowtime", kind: "watching",
    match: { pkg: ["com.skyshowtime.skyshowtime.google"], site: ["SkyShowtime"], domain: ["skyshowtime.com"] },
  },
  {
    id: "canalplus", name: "CANAL+ online", kind: "watching",
    match: { site: ["CANAL+ online", "CANAL+"], domain: ["canalplus.com"] },
  },
  // verify: package / site names not confirmed
  {
    id: "polsatboxgo", name: "Polsat Box Go", kind: "watching",
    match: { pkg: ["pl.redefine.ipla"], site: ["Polsat Box Go"], domain: ["polsatboxgo.pl"] },
  },
  // verify: package / site names not confirmed
  {
    id: "player", name: "Player.pl (TVN)", kind: "watching",
    match: { pkg: ["pl.tvn.player"], site: ["Player.pl", "Player"], domain: ["player.pl"] },
  },
  {
    id: "tvpvod", name: "TVP VOD / TVP Stream", kind: "watching",
    match: { site: ["TVP VOD", "TVP Stream", "Vod.tvp.pl"], domain: ["vod.tvp.pl", "stream.tvp.pl"] },
  },
  // Video pages end with ' - CDA' (checked).
  // verify: package / site names not confirmed
  {
    id: "cda", name: "CDA", kind: "watching",
    match: { pkg: ["pl.cda"], site: ["CDA"], domain: ["cda.pl"] },
  },
  // Polish UI suffix 'Oglądaj na Crunchyroll' is what the user's data shows.
  {
    id: "crunchyroll", name: "Crunchyroll", kind: "watching",
    match: { pkg: ["com.crunchyroll.crunchyroid"], site: ["Crunchyroll", "Oglądaj na Crunchyroll"], domain: ["crunchyroll.com"] },
  },
  // Episode pages end with ' - Oglądaj Anime' (checked); its search page puts 'Wyszukiwanie' last, so segment matching matters.
  {
    id: "ogladajanime", name: "Oglądaj Anime", kind: "watching",
    match: { site: ["Oglądaj Anime"], domain: ["ogladajanime.pl"] },
  },
  {
    id: "anime_pl", name: "Anime online (Shinden, docchi, Desu-Online, wbijam, AnimeZone, Anime-Odcinki)", kind: "watching",
    match: {
      site: ["Shinden", "docchi", "Desu-Online", "wbijam.pl", "AnimeZone", "Anime-Odcinki", "Frixysubs"],
      domain: ["shinden.pl", "docchi.pl", "desu-online.pl", "wbijam.pl", "animezone.pl", "anime-odcinki.pl", "frixysubs.pl"],
    },
  },
  {
    id: "twitch", name: "Twitch / Kick", kind: "watching",
    match: { pkg: ["tv.twitch.android.app", "com.kick.mobile"], site: ["Twitch", "Kick"], domain: ["twitch.tv", "kick.com"] },
  },
  {
    id: "videohosts", name: "Vimeo / Dailymotion", kind: "watching",
    match: { site: ["Vimeo", "Dailymotion"], domain: ["vimeo.com", "dailymotion.com"] },
  },
  {
    id: "players", name: "Odtwarzacze wideo", kind: "watching", alt: ["neutral"],
    match: {
      pkg: ["org.videolan.vlc", "com.mxtech.videoplayer.ad"],
      app: ["VLC", "Mpv", "Potplayermini64", "MPC-HC", "Film i TV", "Movies & TV", "Media Player", "Odtwarzacz multimedialny"],
    },
  },
  // Choosing and rating, not watching.
  {
    id: "filmdb", name: "Bazy filmów i anime (Filmweb, MyAnimeList, AniList)", kind: "waste", group: "film_db", alt: ["watching"],
    match: { site: ["Filmweb", "Ranking Filmweb", "MyAnimeList", "AniList"], domain: ["filmweb.pl", "myanimelist.net", "anilist.co"] },
  },
  // Spotify web player titles are 'Song • Artist' with no site name; see the music_web heuristic.
  {
    id: "spotify", name: "Spotify", kind: "neutral", group: "music", alt: ["watching"],
    match: { pkg: ["com.spotify.music"], app: ["Spotify"], site: ["Spotify"], domain: ["open.spotify.com"] },
  },
  // Only for 'Browser | other'. Seen: 'Hot Knives • Fog Lake'. Excludes titles that also contain ' - ' or ' | '.
  {
    id: "music_web",
    name: "Muzyka w przeglądarce (tytuł „utwór • wykonawca”)",
    kind: "neutral",
    group: "music",
    alt: ["watching"],
    confidence: 0.5,
    heuristic: true,
    match: { title_re: ["^[^-|•]{1,80} • [^-|•]{1,80}$"] },
  },
  // Token is 'YouTube Music'; the user's 'YouTube' class keyword would grab it as watching if keywords run first.
  {
    id: "ytmusic", name: "YouTube Music", kind: "neutral", group: "music", alt: ["watching"],
    match: { pkg: ["com.google.android.apps.youtube.music"], site: ["YouTube Music"], domain: ["music.youtube.com"] },
  },
  {
    id: "music_other", name: "Deezer / Tidal / SoundCloud / Apple Music / Shazam", kind: "neutral", group: "music", alt: ["watching"],
    match: {
      pkg: ["deezer.android.app", "com.aspiro.tidal", "com.soundcloud.android", "com.apple.android.music", "com.shazam.android"],
      app: ["Deezer", "Tidal", "Apple Music", "iTunes"],
      site: ["Deezer", "TIDAL", "SoundCloud", "Apple Music"],
      domain: ["deezer.com", "listen.tidal.com", "soundcloud.com", "music.apple.com"],
    },
  },
  {
    id: "radio_pl", name: "Radio internetowe (Open FM, RMF, Radio ZET)", kind: "neutral", group: "music", alt: ["watching"],
    match: { site: ["Open FM", "RMF FM", "Radio ZET"], domain: ["open.fm", "rmf.fm", "rmfon.pl", "radiozet.pl"] },
  },
  {
    id: "facebook", name: "Facebook", kind: "waste",
    match: { pkg: ["com.facebook.katana", "com.facebook.lite"], site: ["Facebook"], domain: ["facebook.com"] },
  },
  // DMs happen here too, but the default is the feed.
  {
    id: "instagram", name: "Instagram", kind: "waste",
    match: { pkg: ["com.instagram.android"], site: ["Instagram"], domain: ["instagram.com"] },
  },
  {
    id: "threads", name: "Threads", kind: "waste",
    match: { pkg: ["com.instagram.barcelona"], site: ["Threads"], domain: ["threads.net", "threads.com"] },
  },
  {
    id: "tiktok", name: "TikTok", kind: "waste",
    match: {
      pkg: ["com.zhiliaoapp.musically", "com.ss.android.ugc.trill"],
      app: ["Tiktok", "TikTok"],
      site: ["TikTok"],
      domain: ["tiktok.com"],
    },
  },
  // X titles end with ' / X' (e.g. 'Home / X', seen in data), one segment, so they land in 'Browser | other' without the regex.
  {
    id: "x", name: "X / Twitter", kind: "waste",
    match: { pkg: ["com.twitter.android"], site: ["X", "Twitter"], domain: ["x.com", "twitter.com"], title_re: ["\\s/\\sX$"] },
  },
  {
    id: "reddit", name: "Reddit", kind: "waste", alt: ["learning"],
    match: { pkg: ["com.reddit.frontpage"], site: ["Reddit"], domain: ["reddit.com"] },
  },
  // Wykop titles end with ' :: Wykop.pl' (checked); the domain regex turns that into 'wykop.pl'.
  // verify: package / site names not confirmed
  {
    id: "wykop", name: "Wykop / Hejto", kind: "waste",
    match: { pkg: ["pl.wykop.droid"], site: ["Wykop", "wykop.pl", "Hejto"], domain: ["wykop.pl", "hejto.pl"] },
  },
  {
    id: "memes_pl", name: "Memy (Kwejk, JBZD, Demotywatory, 9GAG)", kind: "waste",
    match: {
      pkg: ["com.ninegag.android.app"],
      site: ["KWEJK.pl", "JBZD.com.pl", "Demotywatory", "9GAG"],
      domain: ["kwejk.pl", "jbzd.com.pl", "demotywatory.pl", "9gag.com"],
    },
  },
  // Pudelek article titles have no suffix (checked); only the homepage matches by title.
  {
    id: "gossip_pl", name: "Plotki (Pudelek, Plotek, Pomponik)", kind: "waste",
    match: { site: ["Pudelek", "Pudelek.pl", "Plotek", "Pomponik"], domain: ["pudelek.pl", "plotek.pl", "pomponik.pl"] },
  },
  {
    id: "pinterest", name: "Pinterest / Tumblr", kind: "waste",
    match: {
      pkg: ["com.pinterest", "com.tumblr"],
      site: ["Pinterest", "Tumblr"],
      domain: ["pinterest.com", "pl.pinterest.com", "tumblr.com"],
    },
  },
  {
    id: "snapchat", name: "Snapchat / BeReal", kind: "waste", alt: ["communication"],
    match: { pkg: ["com.snapchat.android", "com.bereal.ft"], site: ["Snapchat"] },
  },
  // No 'games' kind exists; waste is the closest. Steam's store/community pages count the same.
  {
    id: "pc_launchers", name: "Launchery gier (Steam, Epic, Battle.net, Riot)", kind: "waste", group: "games",
    match: {
      app: ["Steam", "Steamwebhelper", "Epicgameslauncher", "Battle.Net", "Riotclientservices", "Leagueclientux"],
      site: ["Steam", "Steam Community", "Welcome to Steam"],
      domain: ["store.steampowered.com", "steamcommunity.com", "epicgames.com"],
    },
  },
  // javaw is deliberately absent: it is any Java app (Ghidra, Burp), not just Minecraft.
  {
    id: "pc_games", name: "Gry na komputerze", kind: "waste", group: "games",
    match: {
      app: [
        "League Of Legends", "Valorant Win64 Shipping", "Cs2", "Minecraft.Windows", "Minecraft", "Robloxplayerbeta", "Genshinimpact",
        "Fortniteclient Win64 Shipping",
      ],
    },
  },
  // Long tail is better served by Android ApplicationInfo.category == GAME on the device.
  {
    id: "mobile_games", name: "Gry na telefonie", kind: "waste", group: "games",
    match: {
      pkg: [
        "com.supercell.clashroyale", "com.supercell.clashofclans", "com.supercell.brawlstars", "com.roblox.client",
        "com.mojang.minecraftpe", "com.miHoYo.GenshinImpact", "com.HoYoverse.hkrpgoversea", "com.king.candycrushsaga", "com.tencent.ig",
        "com.activision.callofduty.shooter", "com.dts.freefireth", "com.kiloo.subwaysurf", "com.innersloth.spacemafia",
      ],
    },
  },
  {
    id: "chess", name: "Szachy (Chess.com, Lichess)", kind: "waste", group: "games", alt: ["learning"],
    match: { pkg: ["com.chess"], site: ["Chess.com", "lichess.org"], domain: ["chess.com", "lichess.org"] },
  },
  {
    id: "gaming_sites", name: "Sklepy z grami (Z2U, G2A, Eneba)", kind: "neutral", group: "shopping", alt: ["waste"],
    match: { site: ["Z2U.COM", "G2A", "Eneba"], domain: ["z2u.com", "g2a.com", "eneba.com"] },
  },
  // Homepage token is the tagline 'Jesteś na bieżąco'.
  {
    id: "onet", name: "Onet", kind: "waste", group: "news", alt: ["neutral"],
    match: {
      pkg: ["pl.onet.newsapp"],
      site: ["Onet", "Jesteś na bieżąco", "Onet Wiadomości", "Onet Sport", "Przegląd Sportowy"],
      domain: ["onet.pl", "przegladsportowy.onet.pl"],
    },
  },
  // Section pages end with ' - WP Wiadomości' (checked).
  {
    id: "wp", name: "Wirtualna Polska", kind: "waste", group: "news", alt: ["neutral"],
    match: {
      site: ["Wirtualna Polska", "WP Wiadomości", "WP SportoweFakty", "WP Teleshow", "WP Finanse", "WP Tech", "WP Kobieta"],
      domain: ["wp.pl"],
    },
  },
  // Pages end with ' - Wydarzenia w INTERIA.PL' -> token 'interia.pl' (checked).
  {
    id: "interia", name: "Interia", kind: "waste", group: "news", alt: ["neutral"],
    match: { site: ["Interia"], domain: ["interia.pl"] },
  },
  {
    id: "news_pl",
    name: "Wiadomości (TVN24, Gazeta, Wyborcza, Rzeczpospolita, Polsat News, Fakt, Super Express, naTemat, money.pl, Business Insider)",
    kind: "waste",
    group: "news",
    alt: ["neutral"],
    match: {
      site: [
        "TVN24", "Gazeta.pl", "Wyborcza.pl", "Rzeczpospolita", "Polsat News", "Fakt", "Super Express", "naTemat", "money.pl",
        "Business Insider Polska", "Business Insider",
      ],
      domain: [
        "tvn24.pl", "gazeta.pl", "wyborcza.pl", "rp.pl", "polsatnews.pl", "fakt.pl", "se.pl", "natemat.pl", "money.pl",
        "businessinsider.com.pl", "o2.pl",
      ],
    },
  },
  // Articles end with ' - Bankier.pl' (checked).
  {
    id: "finance_news", name: "Bankier.pl", kind: "waste", group: "news", alt: ["neutral"],
    match: { site: ["Bankier.pl"], domain: ["bankier.pl"] },
  },
  {
    id: "tech_news_pl",
    name: "Portale technologiczne (Spider's Web, Antyweb, dobreprogramy, PurePC, benchmark, Telepolis)",
    kind: "waste",
    group: "news",
    alt: ["neutral"],
    match: {
      site: ["Spider’s Web", "Spider's Web", "Antyweb", "dobreprogramy", "PurePC", "benchmark.pl", "Telepolis.pl"],
      domain: ["spidersweb.pl", "antyweb.pl", "dobreprogramy.pl", "purepc.pl", "benchmark.pl", "telepolis.pl"],
    },
  },
  {
    id: "news_intl", name: "Wiadomości ze świata (BBC, Guardian, CNN)", kind: "waste", group: "news", alt: ["neutral"],
    match: { site: ["BBC News", "BBC", "The Guardian", "CNN"], domain: ["bbc.com", "bbc.co.uk", "theguardian.com", "cnn.com"] },
  },
  // Product pages end with ' - Allegro', the homepage gives 'allegro.pl', the account page 'Moje Allegro' (all seen in data).
  {
    id: "allegro", name: "Allegro", kind: "neutral", group: "shopping", alt: ["waste"],
    match: {
      pkg: ["pl.allegro"],
      site: ["Allegro", "allegro.pl", "Moje Allegro", "Allegro Lokalnie", "Allegro Pomoc"],
      domain: ["allegro.pl", "allegrolokalnie.pl"],
    },
  },
  // verify: package / site names not confirmed
  {
    id: "olx", name: "OLX", kind: "neutral", group: "shopping", alt: ["waste"],
    match: { pkg: ["pl.tablica"], site: ["OLX", "OLX.pl"], domain: ["olx.pl"] },
  },
  {
    id: "amazon", name: "Amazon", kind: "neutral", group: "shopping", alt: ["waste"],
    match: {
      pkg: ["com.amazon.mShop.android.shopping"],
      site: ["Amazon.pl", "Amazon.com", "Amazon.de"],
      domain: ["amazon.pl", "amazon.com", "amazon.de"],
    },
  },
  {
    id: "aliexpress", name: "AliExpress / Temu / Shein", kind: "neutral", group: "shopping", alt: ["waste"],
    match: {
      pkg: ["com.alibaba.aliexpresshd", "com.einnovation.temu", "com.zzkko"],
      site: ["AliExpress", "Temu", "SHEIN"],
      domain: ["aliexpress.com", "pl.aliexpress.com", "temu.com", "shein.com"],
    },
  },
  {
    id: "vinted", name: "Vinted", kind: "neutral", group: "shopping", alt: ["waste"],
    match: { pkg: ["fr.vinted"], site: ["Vinted"], domain: ["vinted.pl"] },
  },
  // verify: package / site names not confirmed
  {
    id: "shops_pl",
    name: "Sklepy internetowe (Ceneo, Empik, Media Expert, x-kom, Morele, RTV Euro AGD, Zalando, Decathlon)",
    kind: "neutral",
    group: "shopping",
    alt: ["waste"],
    match: {
      pkg: ["pl.ceneo", "de.zalando.mobile"],
      site: ["Ceneo", "Empik.com", "Media Expert", "x-kom", "Morele.net", "RTV EURO AGD", "Zalando", "Decathlon"],
      domain: ["ceneo.pl", "empik.com", "mediaexpert.pl", "x-kom.pl", "morele.net", "euro.com.pl", "zalando.pl", "decathlon.pl"],
    },
  },
  {
    id: "food_delivery", name: "Jedzenie z dowozem (Pyszne, Glovo, Uber Eats, Wolt)", kind: "neutral", group: "errands",
    match: {
      pkg: ["com.yourdelivery.pyszne", "com.glovo", "com.ubercab.eats", "com.wolt.android", "com.mcdonalds.mobileapp"],
      site: ["Pyszne.pl", "Glovo", "Uber Eats", "Wolt"],
      domain: ["pyszne.pl", "glovoapp.com", "ubereats.com", "wolt.com"],
    },
  },
  // verify: package / site names not confirmed
  {
    id: "groceries_parcels", name: "Zakupy i paczki (Lidl Plus, Żabka, InPost)", kind: "neutral", group: "errands",
    match: { pkg: ["com.lidl.eci.lidlplus", "pl.zabka.apb2c", "pl.inpost.inmobile"], site: ["InPost"], domain: ["inpost.pl"] },
  },
  // 'iPKO - bankowość elektroniczna PKO Banku Polskiego' falls into 'Browser | other' because the last segment exceeds 40 characters (seen
  // in data).
  {
    id: "pko", name: "PKO BP (IKO / iPKO)", kind: "neutral", group: "finance",
    match: { pkg: ["pl.pkobp.iko"], site: ["iPKO", "PKO Bank Polski", "IKO"], domain: ["ipko.pl", "pkobp.pl"] },
  },
  {
    id: "mbank", name: "mBank", kind: "neutral", group: "finance",
    match: { pkg: ["pl.mbank"], site: ["mBank", "mBank.pl"], domain: ["mbank.pl"] },
  },
  // verify: package / site names not confirmed
  {
    id: "banks_pl", name: "Banki (ING, Santander, Pekao, Millennium, BNP, Credit Agricole, Alior)", kind: "neutral", group: "finance",
    match: {
      pkg: [
        "pl.ing.mojeing", "pl.bzwbk.bzwbk24", "eu.eleader.mobilebanking.pekao", "wit.android.bcpBankingApp.millenniumPL",
        "com.finanteq.finance.bgz", "com.finanteq.finance.ca", "pl.aliorbank.aib",
      ],
      site: ["Moje ING", "ING Bank Śląski", "Santander Bank Polska", "Pekao24", "Millenet", "GOonline", "GOmobile", "Alior Bank"],
      domain: [
        "ing.pl", "login.ingbank.pl", "santander.pl", "pekao24.pl", "bankmillennium.pl", "goonline.bnpparibas.pl", "credit-agricole.pl",
        "aliorbank.pl",
      ],
    },
  },
  // PayPal pages use 'PayPal: Ustawienia' style titles (seen), one segment, so they need the ': ' split.
  {
    id: "payments", name: "Płatności (PayPal, Revolut, Wise, Skrill, Przelewy24, Google Wallet)", kind: "neutral", group: "finance",
    match: {
      pkg: [
        "com.paypal.android.p2pmobile", "com.revolut.revolut", "com.transferwise.android", "com.moneybookers.skrillpayments",
        "com.google.android.apps.walletnfcrel",
      ],
      app: ["GOmobile", "Skrill"],
      site: ["PayPal", "PayPal PL", "Revolut", "Wise", "Skrill", "Przelewy24"],
      domain: ["paypal.com", "revolut.com", "wise.com", "skrill.com", "przelewy24.pl"],
    },
  },
  {
    id: "gov_pl", name: "e-Urząd (mObywatel, ePUAP, e-Urząd Skarbowy)", kind: "neutral", group: "finance",
    match: {
      pkg: ["pl.nask.mobywatel"],
      site: ["mObywatel", "ePUAP", "e-Urząd Skarbowy", "Profil Zaufany", "Podatki.gov.pl"],
      domain: ["gov.pl", "podatki.gov.pl", "epuap.gov.pl"],
    },
  },
  {
    id: "web_utils", name: "Konwertery plików i narzędzia online", kind: "neutral",
    match: {
      site: ["CloudConvert", "iLovePDF", "Smallpdf", "remove.bg", "TinyPNG", "Free Online"],
      domain: ["cloudconvert.com", "ilovepdf.com", "smallpdf.com", "remove.bg", "tinypng.com"],
    },
  },
  {
    id: "passwords", name: "Menedżery haseł i 2FA", kind: "neutral",
    match: {
      pkg: [
        "com.x8bit.bitwarden", "proton.android.pass", "com.google.android.apps.authenticator2", "com.azure.authenticator",
        "com.authy.authy",
      ],
      app: ["Bitwarden", "Keepassxc", "1Password"],
      site: ["Bitwarden", "SimpleLogin", "Proton Pass"],
      domain: ["vault.bitwarden.com", "app.simplelogin.io", "pass.proton.me"],
    },
  },
  {
    id: "proton_account", name: "Konto Proton / VPN", kind: "neutral",
    match: { pkg: ["ch.protonvpn.android"], app: ["Proton VPN", "Protonvpn"], site: ["Proton Account"], domain: ["account.proton.me"] },
  },
  // 'Google Maps' / 'Mapy Google' are one-segment titles that land in 'Browser | other' today.
  {
    id: "maps", name: "Mapy i nawigacja", kind: "neutral", group: "travel",
    match: { pkg: ["com.google.android.apps.maps", "com.waze"], site: ["Google Maps", "Mapy Google"], domain: ["maps.google.com"] },
  },
  {
    id: "jakdojade", name: "Jakdojade", kind: "neutral", group: "travel",
    match: { pkg: ["com.citynav.jakdojade.pl.android"], site: ["Jakdojade"], domain: ["jakdojade.pl"] },
  },
  {
    id: "rides", name: "Przejazdy (Uber, Bolt, FreeNow)", kind: "neutral", group: "travel",
    match: { pkg: ["com.ubercab", "ee.mtakso.client", "taxi.android.client"], site: ["Uber", "Bolt"] },
  },
  // verify: package / site names not confirmed
  {
    id: "trains_pl", name: "Pociągi i autobusy (KOLEO, PKP Intercity, e-podróżnik, FlixBus, mobilET)", kind: "neutral", group: "travel",
    match: {
      pkg: ["pl.koleo", "pl.mobilet.app", "com.flixbus.app"],
      site: ["KOLEO", "PKP Intercity", "e-podroznik.pl", "FlixBus"],
      domain: ["koleo.pl", "intercity.pl", "e-podroznik.pl", "flixbus.pl"],
    },
  },
  {
    id: "trips", name: "Podróże (Booking, Airbnb, Ryanair)", kind: "neutral", group: "travel",
    match: { site: ["Booking.com", "Airbnb", "Ryanair"], domain: ["booking.com", "airbnb.com", "airbnb.pl", "ryanair.com"] },
  },
  // A search page is a hop, not an activity. 'Google Search' and 'Szukaj w Google' are both in the user's data.
  {
    id: "search", name: "Wyszukiwarka (Google, Bing, DuckDuckGo, Brave Search)", kind: "neutral",
    match: {
      pkg: ["com.google.android.googlequicksearchbox"],
      site: ["Google Search", "Szukaj w Google", "Google", "Bing", "Wyszukaj w Bing", "DuckDuckGo", "Brave Search", "Startpage", "Ecosia"],
      domain: ["bing.com", "duckduckgo.com", "search.brave.com", "startpage.com"],
    },
  },
  // 'New Tab'/'Nowa karta' account for ~22 min of 'Browser | other' (89+34 sessions) in the user's data.
  {
    id: "browser_chrome", name: "Strony przeglądarki (nowa karta, ustawienia, pobrane)", kind: "neutral",
    match: {
      site: [
        "New Tab", "Nowa karta", "New Private Tab", "Nowa karta prywatna", "New Incognito Tab", "Otwieranie", "Untitled", "Bez tytułu",
        "Ustawienia", "Settings", "Rozszerzenia", "Extensions", "Historia", "History", "Pobrane", "Downloads",
        "Najnowsza historia pobierania", "Save password?", "Zapisać hasło?",
        // tracker 1.2's key for internal pages read from the address bar (brave://settings)
        "Browser page",
      ],
    },
  },
  {
    id: "play_store", name: "Sklepy z aplikacjami (Google Play, Microsoft Store)", kind: "neutral",
    match: {
      pkg: ["com.android.vending"],
      app: ["Microsoft Store"],
      site: ["Google Play", "Apps on Google Play", "Aplikacje w Google Play", "Aplikacje na Androida w Google Play", "Chrome Web Store"],
      domain: ["play.google.com"],
    },
  },
  // Planning in the tracker app. The user already labels the web dashboard neutral.
  {
    id: "mindsetforest", name: "MindsetForest", kind: "neutral",
    match: {
      pkg: ["app.mindsetforest.phone"],
      app: ["Mindsetforesttracker", "Mindsetforestsetup", "MindsetForest"],
      site: ["MindsetForest"],
    },
  },
  // Phone browsers report no site; the package says nothing about what was read.
  {
    id: "phone_browsers", name: "Przeglądarka w telefonie", kind: "neutral", group: "phone_browser", opaque: true,
    match: {
      pkg: [
        "com.android.chrome", "com.brave.browser", "org.mozilla.firefox", "com.sec.android.app.sbrowser", "com.opera.browser",
        "com.microsoft.emmx", "com.duckduckgo.mobile.android", "com.kiwibrowser.browser", "com.vivaldi.browser", "com.mi.globalbrowser",
      ],
    },
  },
  // 80 min in the user's data; a running timer or stopwatch keeps the clock in front.
  {
    id: "clock", name: "Zegar, alarmy, minutnik", kind: "neutral",
    match: {
      pkg: ["com.android.deskclock", "com.google.android.deskclock", "com.sec.android.app.clockpackage"],
      app: ["Alarmy i zegar", "Alarms & Clock", "Clock"],
    },
  },
  {
    id: "camera", name: "Aparat", kind: "neutral",
    match: { pkg: ["com.android.camera", "com.google.android.GoogleCamera", "com.sec.android.app.camera"], app: ["Aparat", "Camera"] },
  },
  {
    id: "gallery", name: "Galeria i zdjęcia", kind: "neutral",
    match: {
      pkg: ["com.miui.gallery", "com.google.android.apps.photos", "com.sec.android.gallery3d"],
      app: ["Photos", "Zdjęcia"],
      site: ["Google Photos", "Zdjęcia Google"],
      domain: ["photos.google.com"],
    },
  },
  {
    id: "settings", name: "Ustawienia systemu", kind: "neutral",
    match: {
      pkg: [
        "com.android.settings", "com.miui.securitycenter", "com.miui.notification", "com.google.android.permissioncontroller",
        "com.android.permissioncontroller", "com.miui.global.packageinstaller", "com.google.android.packageinstaller",
        "com.android.packageinstaller", "com.google.android.gms", "com.google.android.apps.wellbeing", "com.miui.cleaner",
        "com.android.systemui", "com.google.android.inputmethod.latin", "com.miui.aod", "com.android.stk",
      ],
      app: ["Settings", "Ustawienia", "Task Manager"],
    },
  },
  // The phone app is meant to drop the current launcher, yet 23 min of com.miui.home reached the server; worth a separate check.
  {
    id: "launchers", name: "Ekran główny telefonu", kind: "neutral",
    match: {
      pkg: [
        "com.miui.home", "com.mi.android.globallauncher", "com.google.android.apps.nexuslauncher", "com.sec.android.app.launcher",
        "com.teslacoilsw.launcher", "com.huawei.android.launcher", "net.oneplus.launcher", "com.oppo.launcher", "app.lawnchair",
      ],
    },
  },
  // Recorder may be a lecture recording; calendar/notes could be work. All neutral by default.
  {
    id: "phone_utils", name: "Narzędzia telefonu (pliki, kalkulator, pogoda, dyktafon, kalendarz, notatki)", kind: "neutral",
    match: {
      pkg: [
        "com.mi.android.globalFileexplorer", "com.google.android.apps.nbu.files", "com.android.documentsui", "com.miui.calculator",
        "com.google.android.calculator", "com.miui.weather2", "com.android.soundrecorder", "com.google.android.apps.recorder",
        "com.google.android.calendar", "com.google.android.keep", "com.miui.notes",
      ],
    },
  },
  {
    id: "automation", name: "Automatyzacja (MacroDroid, Tasker)", kind: "neutral", alt: ["work"],
    match: { pkg: ["com.arlosoft.macrodroid", "net.dinglisch.android.taskerm"] },
  },
  {
    id: "win_shell", name: "Powłoka Windows (Eksplorator, Start, wyszukiwanie, ekran blokady)", kind: "neutral",
    match: {
      app: [
        "Explorer", "Searchhost", "Shellexperiencehost", "Startmenuexperiencehost", "Lockapp", "Locked", "Dwm", "Windows App", "Unknown",
        "Msedgewebview2", "Applicationframehost",
      ],
    },
  },
  {
    id: "win_utils", name: "Narzędzia Windows (wycinanie, Everything, archiwizatory, kalkulator, Notatnik)", kind: "neutral",
    match: {
      app: [
        "Snippingtool", "Screenclippinghost", "Everything", "7Zfm", "Winrar", "Kalkulator", "Calculator", "Calculatorapp", "Notepad",
        "Notatnik", "Sharex", "Greenshot", "Qbittorrent", "Clipclip",
      ],
    },
  },
  {
    id: "screen_rec", name: "Nagrywanie ekranu (OBS, Bandicam)", kind: "neutral", alt: ["work"],
    match: { app: ["Obs64", "Obs", "Bdcam"] },
  },
];
