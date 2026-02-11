# PANDUAN PENGGUNAAN SISTEM MANAJEMEN INVENTARIS

## 1. PENDAHULUAN

### 1.1 Latar Belakang
Dalam operasional perusahaan sehari-hari, kebutuhan akan barang habis pakai (seperti sarung tangan, masker, alat tulis, dll) adalah hal yang rutin. Pengelolaan permintaan barang secara manual (kertas/form) seringkali memakan waktu, sulit dilacak, dan berisiko kehilangan data. Sistem Manajemen Inventaris ini dibuat untuk mendigitalisasi proses tersebut agar lebih cepat, transparan, dan akurat.

### 1.2 Tujuan
- **Efisiensi Waktu**: Mempercepat proses permintaan dan persetujuan barang.
- **Transparansi**: Pemohon dapat memantau status permintaan mereka secara real-time.
- **Akurasi Stok**: Memastikan stok barang tercatat dengan baik (masuk dan keluar).
- **Paperless**: Mengurangi penggunaan kertas untuk formulir permintaan.

### 1.3 Batasan Sistem
Saat ini, sistem mencakup:
- Manajemen stok barang internal (Sarung tangan, masker, safety equipment, dll).
- Proses permintaan barang dari departemen ke gudang (HR/GA).
- Alur persetujuan berjenjang (Pemohon -> Supervisor -> HRGA).
- Pencatatan barang masuk (Incoming) dan penjadwalan pengambilan barang (Batch).
- Sistem ini **belum** mencakup proses pembelian ke supplier (Purchase Order) secara langsung di dalam sistem ini (masih dalam pengembangan terpisah).

---

## 2. PENGGUNAAN BERDASARKAN ROLE (PERAN)

Sistem ini membagi pengguna menjadi beberapa peran dengan hak akses yang berbeda. Silakan baca panduan sesuai dengan peran Anda.

### A. STAFF / ADMIN DEPARTEMEN (PEMOHON)
**Siapa Anda?**: Staff yang ditunjuk departemen (Produksi, QC, Finance, Sales, dll) untuk meminta barang.

#### Langkah 1: Membuat Permintaan (Request) Baru
1. Login ke aplikasi dengan email dan password Anda.
2. Di menu sebelah kiri, klik **"Buat Request"**.
3. Pilih **Departemen** Anda (jika Anda memegang lebih dari satu departemen).
4. Tentukan **Tanggal** permintaan.
5. Pada bagian **Daftar Barang**:
    - Klik tombol **"Tambah Barang"**.
    - Ketik nama barang yang dicari (misal: "Sarung Tangan") atau pilih dari daftar.
    - Masukkan **Jumlah** yang dibutuhkan.
    - Ulangi langkah ini untuk barang lain jika ada.
6. Setelah semua barang dimasukkan, klik tombol **"Simpan Request"**.
7. Permintaan Anda kini berstatus **"Pending"** dan menunggu persetujuan Supervisor.

#### Langkah 2: Memantau Status Permintaan
1. Klik menu **"Daftar Request"**.
2. Anda akan melihat daftar semua permintaan yang pernah dibuat.
3. Perhatikan kolom **Status**:
    - **Pending**: Masih menunggu persetujuan Supervisor.
    - **Approved SPV**: Disetujui Supervisor, menunggu jadwal pengambilan dari HRGA.
    - **Scheduled**: Sudah dijadwalkan untuk diambil. Cek tanggal pengambilannya.
    - **Rejected**: Ditolak (Alasan penolakan dapat dilihat dengan mengklik detail request).

---

### B. SUPERVISOR
**Siapa Anda?**: Atasan yang berwenang menyetujui permintaan barang dari departemen.

#### Langkah 1: Menyetujui/Menolak Permintaan
1. Saat ada permintaan baru, login ke aplikasi.
2. Klik menu **"Approval"** di sebelah kiri (Akan muncul angka merah jika ada permintaan menunggu).
3. Anda akan melihat daftar permintaan yang butuh persetujuan.
4. Klik tombol **"Setujui"** (Hijau) jika permintaan valid.
5. Klik tombol **"Tolak"** (Merah) jika permintaan tidak sesuai. Anda wajib mengisi alasan penolakan.

---

### C. HRGA (ADMIN GUDANG)
**Siapa Anda?**: Pengelola utama stok barang, distribusi, dan penyetuju akhir jadwal pengambilan.

#### Langkah 1: Mengelola Stok & Barang Masuk (Incoming)
Jika ada barang baru datang dari supplier:
1. Klik menu **"Barang Masuk"**.
2. Klik **"Tambah Incoming"**.
3. Masukkan **Nomor PO** dan **Tanggal** penerimaan.
4. Masukkan daftar barang yang diterima beserta jumlahnya.
5. Klik **"Simpan"**. Stok barang akan otomatis bertambah di sistem.

#### Langkah 2: Menjadwalkan Pengambilan Barang (Batching)
Permintaan yang sudah disetujui Supervisor belum bisa diambil sampai Anda menjadwalkannya:
1. Klik menu **"Jadwal Batch"**.
2. Anda akan melihat daftar request yang **siap dijadwalkan** (sudah di-approve Supervisor).
3. Centang (pilih) beberapa request yang ingin digabungkan dalam satu waktu pengambilan.
4. Klik tombol **"Buat Jadwal"**.
5. Pilih **Tanggal** dan **Waktu** pengambilan barang.
6. Klik **"Buat Jadwal"**.
    - Pemohon akan menerima notifikasi kapan mereka bisa mengambil barang.

#### Langkah 3: Verifikasi Pengambilan (OCR & Handover)
Saat pemohon datang mengambil barang (Fitur dalam pengembangan/praktek lapangan):
- Pastikan barang yang diserahkan sesuai dengan dokumen request.
- (Opsional) Gunakan menu **"Verifikasi OCR"** jika menggunakan sistem scan dokumen fisik.

#### Langkah 4: Melihat Laporan
1. Klik menu **"Laporan"**.
2. Anda dapat melihat ringkasan stok, barang paling sering diminta, dan riwayat transaksi.

---

## 3. ALUR KERJA SINGKAT
1. **Staff** buat Request -> status *Pending*.
2. **Supervisor** cek menu Approval -> Setujui -> status *Approved SPV*.
3. **HRGA** cek menu Jadwal Batch -> Buat Jadwal -> status *Scheduled*.
4. **Staff** datang mengambil barang sesuai jadwal.

## 4. BANTUAN
Jika Anda mengalami kendala teknis (tidak bisa login, error sistem, atau data tidak muncul), silakan hubungi tim IT Support atau Admin Sistem.
