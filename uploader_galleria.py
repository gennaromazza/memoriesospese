"""
uploader_galleria.py
====================
Script Python standalone per Windows - Upload Gallerie su Firebase
Versione: 1.0.0

REQUISITI:
    pip install firebase-admin Pillow

CONFIGURAZIONE:
    1. Vai su Firebase Console -> Impostazioni progetto -> Account di servizio
    2. Clicca "Genera nuova chiave privata" -> scarica il file JSON
    3. Rinomina il file scaricato in "service-account.json"
    4. Posiziona "service-account.json" nella stessa cartella di questo script
    5. Esegui: python uploader_galleria.py

PROGETTO FIREBASE:
    Project ID: wedding-gallery-397b6
    Storage Bucket: wedding-gallery-397b6.firebasestorage.app
    URL Galleria: https://memoriesospese.it/gallery/{code}
"""

import os
import sys
import uuid
import json
import string
import random
import threading
import mimetypes
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

# === CONFIGURAZIONE FIREBASE ===
FIREBASE_PROJECT_ID = "wedding-gallery-397b6"
FIREBASE_STORAGE_BUCKET = "wedding-gallery-397b6.firebasestorage.app"
GALLERY_BASE_URL = "https://memoriesospese.it/gallery"

# Estensioni immagine supportate
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif', '.avif'}

# Max worker upload paralleli
MAX_UPLOAD_WORKERS = 3


def generate_gallery_code(length: int = 8) -> str:
    """Genera un codice univoco per la galleria (8 caratteri alfanumerici, stile nanoid)."""
    charset = string.ascii_letters + string.digits
    return ''.join(random.choices(charset, k=length))


def generate_chapter_id(length: int = 10) -> str:
    """Genera un ID per il capitolo (10 caratteri alfanumerici)."""
    charset = string.ascii_letters + string.digits
    return ''.join(random.choices(charset, k=length))


def is_image_file(path: Path) -> bool:
    """Controlla se il file è un'immagine supportata."""
    return path.suffix.lower() in IMAGE_EXTENSIONS


def scan_folder(root_path: str):
    """
    Scansiona la cartella radice.
    - Se ci sono sottocartelle con immagini -> ogni sottocartella è un capitolo
    - Se non ci sono sottocartelle -> tutte le foto vanno senza capitolo (None)
    
    Returns:
        list of dict: [{'name': str|None, 'path': str, 'photos': [Path, ...]}]
    """
    root = Path(root_path)
    chapters = []

    # Foto direttamente nella cartella radice
    root_photos = [f for f in root.iterdir() if f.is_file() and is_image_file(f)]

    # Sottocartelle con almeno una foto
    subdirs = sorted(
        [d for d in root.iterdir() if d.is_dir()],
        key=lambda d: d.name.lower()
    )

    if subdirs:
        # Modalità capitoli: ogni sottocartella è un capitolo
        for idx, subdir in enumerate(subdirs):
            photos = sorted(
                [f for f in subdir.iterdir() if f.is_file() and is_image_file(f)],
                key=lambda f: f.name.lower()
            )
            if photos:
                chapters.append({
                    'name': subdir.name,
                    'path': str(subdir),
                    'ordine': idx,
                    'photos': photos
                })
        # Foto extra nella radice (senza capitolo)
        if root_photos:
            chapters.append({
                'name': None,
                'path': str(root),
                'ordine': len(chapters),
                'photos': sorted(root_photos, key=lambda f: f.name.lower())
            })
    else:
        # Nessuna sottocartella: tutte le foto in un unico gruppo senza capitolo
        if root_photos:
            chapters.append({
                'name': None,
                'path': str(root),
                'ordine': 0,
                'photos': sorted(root_photos, key=lambda f: f.name.lower())
            })

    return chapters


def get_content_type(path: Path) -> str:
    """Determina il Content-Type del file."""
    mime, _ = mimetypes.guess_type(str(path))
    if mime:
        return mime
    ext = path.suffix.lower()
    fallbacks = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.tiff': 'image/tiff', '.tif': 'image/tiff',
        '.heic': 'image/heic', '.heif': 'image/heif',
        '.avif': 'image/avif',
    }
    return fallbacks.get(ext, 'application/octet-stream')


class UploaderApp(tk.Tk):
    """Finestra principale dell'uploader gallerie."""

    def __init__(self):
        super().__init__()
        self.title("Uploader Galleria - Memories Ospese")
        self.geometry("820x900")
        self.minsize(700, 750)
        self.resizable(True, True)
        self.configure(bg="#f7f8fa")

        # Firebase services (inizializzati al primo upload)
        self.firestore_db = None
        self.storage_bucket = None
        self.firebase_ok = False

        # Stato interno
        self.folder_path = tk.StringVar()
        self.chapters_data = []
        self.product_rows = []  # [{'name_var': ..., 'count_var': ...}]
        self.upload_running = False
        self.final_gallery_url = ""

        self._build_ui()

    # =========================================================================
    # UI BUILD
    # =========================================================================

    def _build_ui(self):
        """Costruisce l'interfaccia grafica."""
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('TFrame', background='#f7f8fa')
        style.configure('TLabel', background='#f7f8fa', font=('Segoe UI', 10))
        style.configure('Header.TLabel', font=('Segoe UI', 14, 'bold'), foreground='#1a202c')
        style.configure('Section.TLabel', font=('Segoe UI', 10, 'bold'), foreground='#2d3748')
        style.configure('TButton', font=('Segoe UI', 10), padding=6)
        style.configure('Primary.TButton', font=('Segoe UI', 11, 'bold'))
        style.configure('TEntry', font=('Segoe UI', 10))
        style.configure('TCheckbutton', background='#f7f8fa', font=('Segoe UI', 10))
        style.configure('green.Horizontal.TProgressbar', troughcolor='#e2e8f0', background='#48bb78')

        # Canvas + scrollbar per contenuto scrollabile
        main_canvas = tk.Canvas(self, bg='#f7f8fa', highlightthickness=0)
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=main_canvas.yview)
        self.scroll_frame = ttk.Frame(main_canvas)
        self.scroll_frame.bind("<Configure>", lambda e: main_canvas.configure(
            scrollregion=main_canvas.bbox("all")
        ))
        main_canvas.create_window((0, 0), window=self.scroll_frame, anchor="nw")
        main_canvas.configure(yscrollcommand=scrollbar.set)
        main_canvas.bind_all("<MouseWheel>", lambda e: main_canvas.yview_scroll(int(-1*(e.delta/120)), "units"))

        scrollbar.pack(side="right", fill="y")
        main_canvas.pack(side="left", fill="both", expand=True)

        pad = {'padx': 20, 'pady': 6}

        # --- HEADER ---
        header = ttk.Frame(self.scroll_frame)
        header.pack(fill='x', padx=20, pady=(16, 4))
        ttk.Label(header, text="Uploader Galleria Fotografica", style='Header.TLabel').pack(anchor='w')
        ttk.Label(header, text="Crea e carica una nuova galleria su Firebase", foreground='#718096').pack(anchor='w')
        ttk.Separator(self.scroll_frame, orient='horizontal').pack(fill='x', padx=20, pady=8)

        # --- FORM ---
        form = ttk.Frame(self.scroll_frame)
        form.pack(fill='x', padx=20)

        # Nome galleria
        self._field(form, "Nome galleria *", 'name_var', placeholder="es. Matrimonio Rossi - Bianchi")

        # Data evento
        self._field(form, "Data evento (gg/mm/aaaa)", 'date_var', placeholder="15/06/2025")

        # Luogo
        self._field(form, "Luogo", 'location_var', placeholder="es. Villa Reale, Milano")

        # Descrizione
        ttk.Label(form, text="Descrizione", style='Section.TLabel').pack(anchor='w', pady=(8, 2))
        self.description_text = scrolledtext.ScrolledText(
            form, height=3, font=('Segoe UI', 10), wrap=tk.WORD,
            relief='flat', bd=1, highlightthickness=1,
            highlightbackground='#cbd5e0', highlightcolor='#4299e1'
        )
        self.description_text.pack(fill='x', pady=(0, 4))

        # Password (opzionale) - campo mascherato senza placeholder per evitare ambiguità
        ttk.Label(form, text="Password accesso (opzionale)", style='Section.TLabel').pack(anchor='w', pady=(8, 2))
        self.password_var = tk.StringVar()
        ttk.Entry(form, textvariable=self.password_var, font=('Segoe UI', 10), show='*').pack(fill='x', pady=(0, 2))
        ttk.Label(form, text="Lascia vuoto per nessuna password", foreground='#a0aec0',
                  font=('Segoe UI', 9)).pack(anchor='w', pady=(0, 2))

        ttk.Separator(self.scroll_frame, orient='horizontal').pack(fill='x', padx=20, pady=10)

        # --- SELEZIONE FOTO ---
        sel_frame = ttk.Frame(self.scroll_frame)
        sel_frame.pack(fill='x', padx=20)

        ttk.Label(sel_frame, text="Selezione Foto", style='Section.TLabel').pack(anchor='w', pady=(0, 4))

        self.selection_enabled_var = tk.BooleanVar()
        ttk.Checkbutton(
            sel_frame,
            text="Abilita modalità selezione foto",
            variable=self.selection_enabled_var,
            command=self._on_selection_toggle
        ).pack(anchor='w')

        # Pannello prodotti (mostrato/nascosto)
        self.products_panel = ttk.Frame(sel_frame)
        self.products_panel.pack(fill='x', pady=(6, 0))

        self.products_container = ttk.Frame(self.products_panel)
        self.products_container.pack(fill='x')

        btn_row = ttk.Frame(self.products_panel)
        btn_row.pack(fill='x', pady=(4, 0))
        ttk.Button(btn_row, text="+ Aggiungi prodotto", command=self._add_product_row).pack(side='left')

        # Nasconde il pannello inizialmente
        self.products_panel.pack_forget()

        ttk.Separator(self.scroll_frame, orient='horizontal').pack(fill='x', padx=20, pady=10)

        # --- CARTELLA ---
        folder_frame = ttk.Frame(self.scroll_frame)
        folder_frame.pack(fill='x', padx=20)

        ttk.Label(folder_frame, text="Cartella Foto", style='Section.TLabel').pack(anchor='w', pady=(0, 4))

        folder_row = ttk.Frame(folder_frame)
        folder_row.pack(fill='x')
        self.folder_entry = ttk.Entry(folder_row, textvariable=self.folder_path, state='readonly', font=('Segoe UI', 10))
        self.folder_entry.pack(side='left', fill='x', expand=True, padx=(0, 8))
        ttk.Button(folder_row, text="Seleziona Cartella...", command=self._select_folder).pack(side='right')

        # Preview capitoli
        self.chapters_preview = ttk.Frame(folder_frame)
        self.chapters_preview.pack(fill='x', pady=(8, 0))
        self.chapters_label_var = tk.StringVar(value="")
        ttk.Label(self.chapters_preview, textvariable=self.chapters_label_var, foreground='#4a5568',
                  wraplength=700, justify='left').pack(anchor='w')

        ttk.Separator(self.scroll_frame, orient='horizontal').pack(fill='x', padx=20, pady=10)

        # --- UPLOAD ---
        upload_frame = ttk.Frame(self.scroll_frame)
        upload_frame.pack(fill='x', padx=20)

        self.upload_btn = ttk.Button(
            upload_frame, text="Carica Galleria",
            style='Primary.TButton', command=self._start_upload
        )
        self.upload_btn.pack(fill='x', pady=(0, 8))

        # Barra progresso
        self.progress_var = tk.DoubleVar(value=0)
        self.progress_label_var = tk.StringVar(value="")
        ttk.Label(upload_frame, textvariable=self.progress_label_var, foreground='#4a5568').pack(anchor='w')
        self.progress_bar = ttk.Progressbar(
            upload_frame, variable=self.progress_var, maximum=100,
            style='green.Horizontal.TProgressbar', length=400, mode='determinate'
        )
        self.progress_bar.pack(fill='x', pady=(2, 8))

        # Log
        ttk.Label(upload_frame, text="Log Upload", style='Section.TLabel').pack(anchor='w')
        self.log_text = scrolledtext.ScrolledText(
            upload_frame, height=10, font=('Consolas', 9), state='disabled',
            bg='#1a202c', fg='#e2e8f0', relief='flat',
            insertbackground='white'
        )
        self.log_text.pack(fill='x', pady=(2, 8))

        # Link risultato
        self.result_frame = ttk.Frame(self.scroll_frame)
        self.result_frame.pack(fill='x', padx=20, pady=(0, 16))
        self.result_label_var = tk.StringVar(value="")
        self.result_link_var = tk.StringVar(value="")
        self.result_label = ttk.Label(self.result_frame, textvariable=self.result_label_var,
                                       font=('Segoe UI', 10, 'bold'), foreground='#2f855a')
        self.result_label.pack(anchor='w')

        link_row = ttk.Frame(self.result_frame)
        self.link_row = link_row
        self.link_entry = ttk.Entry(link_row, textvariable=self.result_link_var,
                                     state='readonly', font=('Segoe UI', 10), width=55)
        self.link_entry.pack(side='left', padx=(0, 8))
        self.copy_btn = ttk.Button(link_row, text="Copia Link", command=self._copy_link)
        self.copy_btn.pack(side='left')

    def _field(self, parent, label: str, attr: str, placeholder: str = "", show: str = ""):
        """Crea un campo di input standard con label."""
        ttk.Label(parent, text=label, style='Section.TLabel').pack(anchor='w', pady=(8, 2))
        var = tk.StringVar()
        setattr(self, attr, var)
        entry = ttk.Entry(parent, textvariable=var, font=('Segoe UI', 10), show=show)
        entry.pack(fill='x', pady=(0, 2))
        if placeholder:
            entry.insert(0, placeholder)
            entry.config(foreground='#a0aec0')

            def on_focus_in(e, _entry=entry, _ph=placeholder, _var=var):
                if _entry.get() == _ph:
                    _entry.delete(0, tk.END)
                    _entry.config(foreground='#1a202c')

            def on_focus_out(e, _entry=entry, _ph=placeholder, _var=var):
                if not _entry.get():
                    _entry.insert(0, _ph)
                    _entry.config(foreground='#a0aec0')

            entry.bind('<FocusIn>', on_focus_in)
            entry.bind('<FocusOut>', on_focus_out)

        return entry

    def _get_field_value(self, attr: str, placeholder: str = "") -> str:
        """Legge il valore di un campo, escludendo il placeholder."""
        val = getattr(self, attr).get().strip()
        if val == placeholder:
            return ""
        return val

    # =========================================================================
    # SELECTION TOGGLE
    # =========================================================================

    def _on_selection_toggle(self):
        if self.selection_enabled_var.get():
            self.products_panel.pack(fill='x', pady=(6, 0))
            if not self.product_rows:
                self._add_product_row()
        else:
            self.products_panel.pack_forget()

    def _add_product_row(self):
        """Aggiunge una riga prodotto (nome + numero foto)."""
        row_frame = ttk.Frame(self.products_container)
        row_frame.pack(fill='x', pady=2)

        name_var = tk.StringVar()
        count_var = tk.StringVar(value="0")

        ttk.Label(row_frame, text="Nome:").pack(side='left')
        ttk.Entry(row_frame, textvariable=name_var, width=28, font=('Segoe UI', 10)).pack(side='left', padx=(4, 8))
        ttk.Label(row_frame, text="N. foto:").pack(side='left')
        ttk.Entry(row_frame, textvariable=count_var, width=6, font=('Segoe UI', 10)).pack(side='left', padx=(4, 8))

        row_data = {'name_var': name_var, 'count_var': count_var, 'frame': row_frame}
        self.product_rows.append(row_data)

        ttk.Button(row_frame, text="✕", width=3,
                   command=lambda rd=row_data: self._remove_product_row(rd)).pack(side='left')

    def _remove_product_row(self, row_data):
        row_data['frame'].destroy()
        self.product_rows.remove(row_data)

    # =========================================================================
    # FOLDER SELECTION
    # =========================================================================

    def _select_folder(self):
        path = filedialog.askdirectory(title="Seleziona la cartella con le foto")
        if not path:
            return
        self.folder_path.set(path)
        self.chapters_data = scan_folder(path)
        self._update_chapters_preview()

    def _update_chapters_preview(self):
        if not self.chapters_data:
            self.chapters_label_var.set("Nessuna immagine trovata nella cartella selezionata.")
            return

        total_photos = sum(len(ch['photos']) for ch in self.chapters_data)
        lines = [f"Trovate {total_photos} foto totali:"]

        for ch in self.chapters_data:
            n = len(ch['photos'])
            name = ch['name'] if ch['name'] else "(senza capitolo)"
            lines.append(f"  • {name}: {n} foto")

        self.chapters_label_var.set("\n".join(lines))

    # =========================================================================
    # FIREBASE INIT
    # =========================================================================

    def _init_firebase(self) -> bool:
        """Inizializza Firebase Admin SDK usando service-account.json."""
        if self.firebase_ok:
            return True

        script_dir = Path(__file__).parent
        sa_path = script_dir / "service-account.json"

        if not sa_path.exists():
            messagebox.showerror(
                "File mancante",
                f"File 'service-account.json' non trovato in:\n{script_dir}\n\n"
                "Scarica il Service Account dalla Firebase Console:\n"
                "Impostazioni progetto > Account di servizio > Genera nuova chiave privata\n"
                "Rinomina il file in 'service-account.json' e posizionalo nella stessa cartella dello script."
            )
            return False

        try:
            import firebase_admin
            from firebase_admin import credentials, firestore, storage as fb_storage

            if not firebase_admin._apps:
                cred = credentials.Certificate(str(sa_path))
                firebase_admin.initialize_app(cred, {
                    'storageBucket': FIREBASE_STORAGE_BUCKET
                })

            self.firestore_db = firestore.client()
            self.storage_bucket = fb_storage.bucket()
            self.firebase_ok = True
            return True

        except ImportError:
            messagebox.showerror(
                "Dipendenza mancante",
                "Il pacchetto 'firebase-admin' non è installato.\n\n"
                "Esegui nel terminale:\n  pip install firebase-admin\n\n"
                "Poi riavvia lo script."
            )
            return False
        except Exception as e:
            messagebox.showerror("Errore Firebase", f"Impossibile inizializzare Firebase:\n{e}")
            return False

    # =========================================================================
    # UPLOAD ENGINE
    # =========================================================================

    def _log(self, message: str):
        """Aggiunge un messaggio al log (thread-safe)."""
        def _append():
            self.log_text.config(state='normal')
            self.log_text.insert(tk.END, message + "\n")
            self.log_text.see(tk.END)
            self.log_text.config(state='disabled')
        self.after(0, _append)

    def _set_progress(self, value: float, label: str = ""):
        """Aggiorna la barra di avanzamento (thread-safe)."""
        def _update():
            self.progress_var.set(min(value, 100))
            if label:
                self.progress_label_var.set(label)
        self.after(0, _update)

    def _start_upload(self):
        """
        Valida i campi, raccoglie TUTTI i valori dal form sul main thread,
        poi avvia l'upload in un thread separato passando solo dati puri.
        NOTA: Tkinter non è thread-safe — nessun widget va letto fuori dal main thread.
        """
        if self.upload_running:
            return

        # --- Raccolta valori form (TUTTO sul main thread) ---

        name = self._get_field_value('name_var', 'es. Matrimonio Rossi - Bianchi').strip()
        if not name:
            messagebox.showerror("Campo obbligatorio", "Inserisci il nome della galleria.")
            return

        if not self.folder_path.get():
            messagebox.showerror("Cartella mancante", "Seleziona la cartella con le foto.")
            return

        if not self.chapters_data:
            messagebox.showerror("Nessuna foto", "Nessuna immagine trovata nella cartella selezionata.")
            return

        date_val = self._get_field_value('date_var', '15/06/2025')
        location_val = self._get_field_value('location_var', 'es. Villa Reale, Milano')
        description_val = self.description_text.get("1.0", tk.END).strip()
        password_val = self.password_var.get().strip()
        selection_enabled = self.selection_enabled_var.get()

        # Prodotti (letti tutti sul main thread)
        product_requirements = []
        if selection_enabled:
            for row in self.product_rows:
                prod_name = row['name_var'].get().strip()
                count_str = row['count_var'].get().strip()
                if prod_name:
                    try:
                        count = int(count_str)
                    except ValueError:
                        count = 0
                    product_requirements.append({
                        'prodottoNome': prod_name,
                        'prodottoNumeroFoto': count
                    })

        # Snapshot immutabile dei capitoli (già struttura Python, nessun widget)
        chapters_snapshot = [
            {
                'name': ch['name'],
                'ordine': ch['ordine'],
                'photos': list(ch['photos'])  # copia lista Path
            }
            for ch in self.chapters_data
        ]

        # Payload puro da passare al thread
        payload = {
            'gallery_name': name,
            'date': date_val,
            'location': location_val,
            'description': description_val,
            'password': password_val,
            'selection_enabled': selection_enabled,
            'product_requirements': product_requirements,
            'chapters': chapters_snapshot,
        }

        if not self._init_firebase():
            return

        # Disabilita pulsante e avvia upload
        self.upload_running = True
        self.upload_btn.config(state='disabled', text="Upload in corso...")
        self.result_label_var.set("")
        self.link_row.pack_forget()
        self.progress_var.set(0)
        self.progress_label_var.set("Avvio upload...")

        thread = threading.Thread(
            target=self._run_upload,
            args=(payload,),
            daemon=True
        )
        thread.start()

    def _run_upload(self, payload: dict):
        """
        Esegue l'intero processo di upload nel thread separato.
        Riceve solo dati Python puri (nessun widget/StringVar Tkinter).
        """
        try:
            gallery_name = payload['gallery_name']
            date_val = payload['date']
            location_val = payload['location']
            description_val = payload['description']
            password_val = payload['password']
            selection_enabled = payload['selection_enabled']
            product_requirements = payload['product_requirements']
            chapters_data_local = payload['chapters']

            self._log("=" * 50)
            self._log(f"Avvio creazione galleria: {gallery_name}")
            self._log("=" * 50)

            # Genera ID e codice galleria
            gallery_id = str(uuid.uuid4())
            gallery_code = generate_gallery_code(8)
            has_chapters = any(ch['name'] for ch in chapters_data_local)

            self._log(f"Gallery ID: {gallery_id}")
            self._log(f"Codice galleria: {gallery_code}")

            # Calcola total required photos
            required_photo_count = sum(p['prodottoNumeroFoto'] for p in product_requirements)

            # Costruisci array capitoli Firestore
            firestore_chapters = []
            for ch in chapters_data_local:
                if ch['name']:
                    firestore_chapters.append({
                        'id': generate_chapter_id(),
                        'titolo': ch['name'],
                        'descrizione': '',
                        'ordine': ch['ordine'],
                        'createdAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow()
                    })

            # --- SCRIVI documento galleries ---
            self._log("\nCreazione documento galleria su Firestore...")
            gallery_doc = {
                'name': gallery_name,
                'code': gallery_code,
                'date': date_val,
                'location': location_val,
                'description': description_val,
                'hasPassword': bool(password_val),
                'active': True,
                'photoCount': 0,
                'selectionEnabled': selection_enabled,
                'unlimitedSelection': False,
                'requiredPhotoCount': required_photo_count,
                'chaptersEnabled': has_chapters,
                'chapters': firestore_chapters,
                'userId': 'script-upload',
                'createdAt': datetime.utcnow(),
                'updatedAt': datetime.utcnow(),
            }

            if selection_enabled:
                gallery_doc['productRequirements'] = product_requirements  # [] se nessun prodotto
                gallery_doc['selectionStatus'] = 'pending'
                gallery_doc['selectedPhotoIds'] = []

            from firebase_admin import firestore as fb_firestore

            gallery_ref = self.firestore_db.collection('galleries').document(gallery_id)
            gallery_ref.set(gallery_doc)
            self._log("✓ Documento galleria creato")

            # --- SCRIVI documento gallerySecrets ---
            self._log("Creazione documento gallerySecrets...")
            secrets_doc = {
                'galleryId': gallery_id,
                'password': password_val if password_val else None,
                'specialPin': None,
                'createdAt': datetime.utcnow(),
                'updatedAt': datetime.utcnow(),
            }
            self.firestore_db.collection('gallerySecrets').document(gallery_id).set(secrets_doc)
            self._log("✓ Documento gallerySecrets creato")

            # --- UPLOAD FOTO ---
            # Crea mappa chapter name -> chapter id
            chapter_id_map = {ch['titolo']: ch['id'] for ch in firestore_chapters}

            # Costruisci lista piatta di tutti i job
            upload_jobs = []
            for ch_data in chapters_data_local:
                chapter_id = chapter_id_map.get(ch_data['name']) if ch_data['name'] else None
                for photo_path in ch_data['photos']:
                    upload_jobs.append({
                        'path': photo_path,
                        'chapter_id': chapter_id,
                        'gallery_id': gallery_id
                    })

            total = len(upload_jobs)
            self._log(f"\nInizio upload di {total} foto (max {MAX_UPLOAD_WORKERS} in parallelo)...\n")

            completed = 0
            errors = []
            lock = threading.Lock()

            def upload_single(job: dict) -> dict:
                """Carica una singola foto su Storage e scrive metadati su Firestore."""
                photo_path: Path = job['path']
                chapter_id = job['chapter_id']
                gid = job['gallery_id']

                original_filename = photo_path.name
                # Prefisso random per evitare collisioni tra file con stesso nome in capitoli diversi
                unique_prefix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
                storage_filename = f"{unique_prefix}_{original_filename}"
                storage_path = f"galleries/{gid}/photos/{storage_filename}"
                content_type = get_content_type(photo_path)
                file_size = photo_path.stat().st_size

                # Upload su Firebase Storage
                blob = self.storage_bucket.blob(storage_path)
                blob.upload_from_filename(
                    str(photo_path),
                    content_type=content_type
                )

                # Rendi il file pubblicamente leggibile.
                # NOTA: Se il bucket usa Uniform Bucket-Level Access (UBLA), make_public()
                # fallisce. In tal caso viene usato un Signed URL temporaneo (1 anno).
                try:
                    blob.make_public()
                    download_url = blob.public_url
                except Exception:
                    # Fallback: generate_signed_url richiede service account con signBlob permission
                    from datetime import timedelta
                    download_url = blob.generate_signed_url(
                        expiration=timedelta(days=365),
                        method='GET',
                        version='v4'
                    )

                # Scrivi documento photos su Firestore
                photo_doc = {
                    'galleryId': gid,
                    'chapterId': chapter_id,
                    'name': original_filename,  # Nome originale nei metadati
                    'url': download_url,
                    'size': file_size,
                    'contentType': content_type,
                    'uploadedBy': 'admin',
                    'uploaderUid': 'script-upload',
                    'uploaderEmail': 'admin@script',
                    'uploaderName': 'Script Upload',
                    'likeCount': 0,
                    'commentCount': 0,
                    'position': 0,
                    'createdAt': datetime.utcnow(),
                }

                self.firestore_db.collection('photos').add(photo_doc)
                return {'filename': filename, 'ok': True}

            with ThreadPoolExecutor(max_workers=MAX_UPLOAD_WORKERS) as executor:
                future_to_job = {executor.submit(upload_single, job): job for job in upload_jobs}

                for future in as_completed(future_to_job):
                    job = future_to_job[future]
                    filename = job['path'].name
                    try:
                        result = future.result()
                        with lock:
                            completed += 1
                        pct = (completed / total) * 100
                        self._set_progress(pct, f"Caricata {completed}/{total}: {filename}")
                        self._log(f"  ✓ {filename}")
                    except Exception as exc:
                        with lock:
                            completed += 1
                            errors.append((filename, str(exc)))
                        pct = (completed / total) * 100
                        self._set_progress(pct, f"Errore {completed}/{total}: {filename}")
                        self._log(f"  ✗ ERRORE {filename}: {exc}")

            # --- AGGIORNA photoCount ---
            success_count = total - len(errors)
            self._log(f"\nAggiornamento photoCount: {success_count} foto...")
            gallery_ref.update({
                'photoCount': success_count,
                'updatedAt': datetime.utcnow()
            })
            self._log("✓ photoCount aggiornato")

            # --- RISULTATO FINALE ---
            gallery_url = f"{GALLERY_BASE_URL}/{gallery_code}"
            self.final_gallery_url = gallery_url

            self._log("\n" + "=" * 50)
            self._log("UPLOAD COMPLETATO!")
            self._log(f"Foto caricate: {success_count}/{total}")
            if errors:
                self._log(f"Errori: {len(errors)}")
            self._log(f"URL Galleria: {gallery_url}")
            self._log("=" * 50)

            self._set_progress(100, f"Completato! {success_count}/{total} foto caricate.")

            def _show_result():
                self.result_label_var.set(
                    f"✓ Galleria creata! {success_count}/{total} foto caricate."
                )
                self.result_link_var.set(gallery_url)
                self.link_row.pack(anchor='w', pady=(4, 0))
                if errors:
                    messagebox.showwarning(
                        "Upload completato con errori",
                        f"{success_count}/{total} foto caricate con successo.\n"
                        f"{len(errors)} foto non caricate a causa di errori.\n"
                        f"Controlla il log per i dettagli."
                    )

            self.after(0, _show_result)

        except Exception as e:
            self._log(f"\n✗ ERRORE CRITICO: {e}")
            import traceback
            self._log(traceback.format_exc())
            self.after(0, lambda: messagebox.showerror("Errore Upload", f"Errore durante l'upload:\n{e}"))
        finally:
            def _reset():
                self.upload_running = False
                self.upload_btn.config(state='normal', text="Carica Galleria")
            self.after(0, _reset)

    def _copy_link(self):
        """Copia il link della galleria negli appunti."""
        link = self.result_link_var.get()
        if link:
            self.clipboard_clear()
            self.clipboard_append(link)
            self.copy_btn.config(text="Copiato!")
            self.after(2000, lambda: self.copy_btn.config(text="Copia Link"))


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == '__main__':
    app = UploaderApp()
    app.mainloop()
