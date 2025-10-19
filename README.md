# 🧠 dumpu — Simple Codebase Dumper (for developers)

`dumpu` হল একটি lightweight CLI টুল যা কোনো Git রিপোজিটরির সমস্ত কোড ফাইল একসাথে **একটি `.txt` বা `.md` ফাইলে** ডাম্প করে দেয় — সহজ রিভিউ, ব্যাকআপ বা AI কোড অ্যানালিসিসের জন্য।

---

## 🚀 Installation

```bash
# Install globally
npm install -g dumpu

# OR use directly with npx (recommended)
npx dumpu
```

---

## 📦 Usage

### 🔹 Basic Command

```bash
npx dumpu
```

```bash
npx dumpu --fileName=frontend.md
```

```bash
npx dumpu --fileName=backend.md
```

➡️ ডিফল্ট আউটপুট:
- Location: `~/Downloads/completeCodebase.txt`
- Format: `.txt`

---

### 🔹 Output Format Options

| Option | Description | Example |
|--------|--------------|----------|
| `--md` | Markdown ফরম্যাটে আউটপুট | `npx dumpu --md` |
| `--txt` | Text ফরম্যাটে আউটপুট | `npx dumpu --txt` |
| `--format` | এক্সপ্লিসিটভাবে ফরম্যাট নির্দিষ্ট করা | `npx dumpu --format md` |
| `--fileName` | কাস্টম ফাইলনেম সেট করা | `npx dumpu --fileName=mydump.md` |

---

### 🔹 Size Limit Control

ডিফল্টে প্রতিটি ফাইলের সর্বোচ্চ সাইজ **200KB** পর্যন্ত অন্তর্ভুক্ত হয়।  
প্রয়োজনে এটি CLI আর্গুমেন্ট দিয়ে বাড়ানো যায়।

```bash
npx dumpu --maxKB=300
```

---

## 🧩 Examples

**Markdown dump (with TOC):**
```bash
npx dumpu --md
```

**Plain text dump (default):**
```bash
npx dumpu
```

**Custom name and larger file limit:**
```bash
npx dumpu --fileName=myproject.md --maxKB=500
```

**Force text format even with .md name:**
```bash
npx dumpu --fileName=backup.md --txt
```

---

## 🧠 Features

✅ Dumps entire repo’s tracked + untracked files  
✅ Respects `.gitignore` rules  
✅ Auto-detects programming language (for Markdown syntax highlighting)  
✅ Includes a preamble block with processing & patch rules  
✅ Progress display with time tracking  
✅ Default output in `~/Downloads/`  
✅ Safe limits (max file size, allowed extensions)

---

## 📁 Output Structure (Markdown mode)

```markdown
# Codebase Dump
> Generated at: 2025-10-20T10:00:00Z

## Processing Rules
```
(instruction block)
```

## Table of Contents
- `src/index.js`
- `package.json`
- ...

## Files
### `src/index.js`
```javascript
console.log("Hello world");
```
```

---

## ⚙️ Config Summary

- Default max file size: **200KB**
- Default format: **txt**
- Output dir: `~/Downloads/`
- Allowed extensions: js, ts, jsx, tsx, py, php, html, css, json, yaml, etc.
- Skips binaries and lock files

---

## 🧩 License

MIT © [Souvik](https://github.com/ssouvikk)