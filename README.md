# Kids Tutor – Vercel (Other)

Tahle složka obsahuje **hotový minimální projekt**: 1× `index.html` (UI) a 1× API endpoint `/api/generate` (Edge funkce, volá OpenAI).

## Co potřebuješ
- GitHub účet
- Nainstalovaný Git
- OpenAI API klíč (viz platform.openai.com → Settings → API keys)

## Jak to nasadit (krok za krokem)

1) **Stáhni ZIP** (nebo zkopíruj tuto složku) a rozbal ji.
2) Otevři terminál v této složce a založ Git repo:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
```
3) Na GitHubu vytvoř **nové prázdné repo** (bez README). Pak ho napoj:
```bash
git remote add origin https://github.com/TVUJ_UCET/kids-tutor.git
git push -u origin main
```
4) Přihlas se do **Vercelu** → **New Project** → **Import from GitHub** → vyber repo.
   - Framework: **Other**
   - Environment Variables: přidej `OPENAI_API_KEY = tvuj_super_tajny_klic`
   - Deploy

5) Otevři v prohlížeči URL projektu. Na iPadu dej **Sdílet → Přidat na plochu**.

## Jak to funguje
- `index.html` běží jako statická stránka v prohlížeči, ukládá **statistiky** do `localStorage` (pokusy, úspěšnost, streak).
- Tlačítko **„Načíst balíček (AI)”** volá `/api/generate` a stáhne balíček anglických slovíček.
- Backend běží jako **Edge funkce** v souboru `api/generate.js`. Tam se čte `process.env.OPENAI_API_KEY` (musíš ho nastavit ve Vercelu).

## Co můžeš přidat později
- Serverové statistiky (Vercel KV nebo Postgres), pokud chceš synchronizovat napříč zařízeními.
- Přepnout endpoint na **Responses API** (stejná logika, jiný URL/JSON).
- Větší sady vyjmenovaných slov, režim A/B/C/D, TTS pro diktát.
