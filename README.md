# CheatSheet Studio

<div align="center">

**Math · Science · Economics · Finance cheat-sheet builder**

License: [MIT](./LICENSE)

</div>

<br />

<div align="center">
  <img
    src="screenshots/workspace.png"
    alt="CheatSheet Studio workspace — canvas with equations, library panel, and properties"
    width="920"
  />
  <p><em>Workspace: freeform canvas, subject library, properties, and tools</em></p>
</div>

<br />

A Firebase-backed cheat sheet builder. Drag equations, tables, and figures from a subject library onto a freeform canvas, create custom LaTeX (KaTeX), import images, resize panels, and sync sheets per Google account.

> **Firebase is required.** Auth, Firestore, Storage, and Hosting are part of the product. Local UI can load a built-in library catalog, but sign-in, cloud sheets, and image upload need a configured Firebase project.

---

## Features

- Freeform canvas with drag, move, resize, zoom, pan, and grid snap
- Subject library (Mathematics, Physics, Chemistry, Biology, Economics, Finance)
- KaTeX equations with crisp font-size fit when resizing cards
- Custom equations, markdown tables, and figure import
- Print-size overlay (Letter / A4) and auto-organize
- Google sign-in and per-user sheets (Firestore)
- Firebase Hosting deploy

---

## Stack

| Layer | Tech |
|-------|------|
| UI | React 19, Vite, TypeScript, Tailwind CSS v4 |
| State | Zustand |
| Math | KaTeX |
| DnD / layout | @dnd-kit, react-resizable-panels |
| Backend | Firebase Auth (Google), Firestore, Storage, Hosting |

---

## Prerequisites

1. **Node.js** 20+ and npm  
2. A **Firebase project** with:
   - **Authentication** → Google sign-in enabled  
   - **Firestore** database created  
   - **Storage** enabled  
   - A **Web app** registered (for client config)  
3. **Firebase CLI** (for deploy): `npm i -g firebase-tools`

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/kevinkicho/cheatsheet_studio.git
cd cheatsheet_studio
npm install
```

### 2. Firebase client config (required)

Client keys live in **`.env`** only (gitignored). Copy the example and fill values from  
**Firebase Console → Project settings → Your apps → Web app config**:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |

**Do not commit `.env`, Admin SDK JSON, or hardcode config in source.**  
`.gitignore` excludes `.env*`, `*firebase-adminsdk*.json`, and related secrets.

### 3. Firebase Console checklist

1. **Authentication** → Sign-in method → enable **Google**  
2. **Authorized domains** → add `localhost` and your Hosting domain  
3. **Firestore** → create database; deploy rules  
4. **Storage** → enable default bucket; deploy rules  

```bash
firebase login
firebase use mathstudy071026   # or your project id
firebase deploy --only firestore:rules,storage
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Until Firestore is seeded, the app uses a **built-in local catalog**. Optional cloud seed (Admin SDK JSON in project root — **never commit it**):

```bash
npm run seed
```

---

## Deploy to Firebase Hosting

Hosting serves the Vite production build from **`dist`** (see `firebase.json`).

```bash
# Ensure .env is present so Vite bakes client config into the build
npm run build
firebase deploy --only hosting
```

After deploy, add the Hosting domain under **Authentication → Settings → Authorized domains**.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run seed` | Seed `libraryItems` via Admin SDK |

---

## App layout

| Region | Role |
|--------|------|
| Top bar | Workspace / Library / Sheets, sheet switcher, print size, account |
| Left | Properties (selection or sheet) |
| Center | Freeform canvas |
| Right | Layers, create equation, import image |
| Bottom | Collapsible library by subject / topic |

---

## Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center" valign="middle">
        <img
          src="screenshots/workspace.png"
          alt="CheatSheet Studio main workspace"
          width="880"
        />
        <br />
        <sub>Main workspace with equation cards and economics library</sub>
      </td>
    </tr>
  </table>
</div>

---

## Security notes

- Never import Admin credentials into `src/`.  
- Web API keys are public in the browser; **Firestore / Storage rules** protect data.  
- Sheets are private to `ownerId == auth.uid`.  
- System library items are read-only from the client.

---

## License

Released under the [MIT License](./LICENSE).

**Attribution (courtesy):** The product direction and requirements were provided by the project owner; implementation (code, Firebase setup, and iteration) was done by **Grok / xAI**.
