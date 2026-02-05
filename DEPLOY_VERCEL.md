# 🚀 Deployment Instructions: Frontend en Vercel + Backend en Render

## Configuración Actual

- **Backend**: https://fem-unsaac-backend.onrender.com
- **Frontend**: Por desplegar en Vercel
- **Database**: Supabase (https://tsqjmwyvgihijndvfyua.supabase.co)

---

## 📋 Pasos para Desplegar en Vercel

### 1. **Preparar el repositorio (si aún no existe)**

```bash
cd frontend2
git init
git add .
git commit -m "Initial commit: FEM Frontend with Astro + React"
git remote add origin git@github.com:TU_USUARIO/fem-unsaac-frontend.git
git push -u origin main
```

### 2. **Conectar a Vercel**

#### Opción A: Desde la CLI
```bash
npm i -g vercel
vercel login
vercel
```

#### Opción B: Desde el Dashboard
1. Ve a https://vercel.com/new
2. Importa tu repositorio Git
3. Selecciona el framework: **Astro**
4. Root Directory: `frontend2` (si tu repo es monorepo) o `.` (si solo tienes el frontend)

### 3. **Configurar Variables de Entorno en Vercel**

Ve a **Project Settings → Environment Variables** y agrega:

```plaintext
PUBLIC_SUPABASE_URL=https://tsqjmwyvgihijndvfyua.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzcWptd3l2Z2loaWpuZHZmeXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MzIyMjIsImV4cCI6MjA4NTEwODIyMn0.feOu_8CbX2P7OsGU1NCs6ancKxeZBmkdiMw2qXHPSok
PUBLIC_API_URL=https://fem-unsaac-backend.onrender.com
```

**IMPORTANTE:** 
- Marca estas variables para **Production**, **Preview** y **Development**
- No uses comillas en los valores

### 4. **Build Settings en Vercel**

Si Vercel no detecta automáticamente:

```plaintext
Framework Preset: Astro
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Node Version: 18.x (o 20.x)
```

### 5. **Redeploy**

Después de configurar las variables de entorno:
- Ve a **Deployments** → selecciona el último deployment
- Click en **⋯** (tres puntos) → **Redeploy**

---

## 🔧 Verificación

### Test de Conexión Backend

Abre la consola del navegador en tu sitio de Vercel y ejecuta:

```javascript
fetch('https://fem-unsaac-backend.onrender.com/health')
  .then(r => r.json())
  .then(console.log)
```

Deberías ver:
```json
{"status":"healthy","service":"fem-backend"}
```

### Test de API con Auth

```javascript
// En tu app desplegada, después de hacer login
const response = await fetch('https://fem-unsaac-backend.onrender.com/api/library/standard', {
  headers: {
    'Authorization': `Bearer ${session.access_token}`
  }
});
console.log(await response.json());
```

---

## ⚠️ Troubleshooting

### Error: "CORS policy blocked"

✅ **SOLUCIONADO**: El backend ya tiene CORS configurado con `allow_origins=["*"]`

Si aún ves el error:
1. Verifica que `PUBLIC_API_URL` en Vercel sea HTTPS (no HTTP)
2. Revisa la consola del navegador para el error exacto

### Error: "Failed to fetch"

- **Causa**: Backend de Render está dormido (Free Plan)
- **Solución**: Espera ~30 segundos en la primera request (cold start)
- **Prevención**: Upgrade a Render Paid Plan o usa cron job para mantenerlo activo

### Error: "Unauthorized" en requests

- Verifica que `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` estén configurados correctamente
- Confirma que estás logueado antes de hacer requests al backend

---

## 🔄 Flujo de Desarrollo

### Local Development
```bash
npm run dev
# Backend: http://localhost:8000 (desde .env)
```

### Production
```bash
# Automático en cada push a main
# Backend: https://fem-unsaac-backend.onrender.com
```

---

## 📦 Estructura de .env

### `.env` (local)
```plaintext
PUBLIC_SUPABASE_URL=https://tsqjmwyvgihijndvfyua.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
PUBLIC_API_URL=http://localhost:8000  # ← Para desarrollo local
```

### Vercel (production)
```plaintext
PUBLIC_SUPABASE_URL=https://tsqjmwyvgihijndvfyua.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
PUBLIC_API_URL=https://fem-unsaac-backend.onrender.com  # ← Para producción
```

---

## ✅ Checklist de Deployment

- [ ] Backend desplegado y funcionando en Render
- [ ] Frontend código pusheado a GitHub
- [ ] Proyecto importado en Vercel
- [ ] Variables de entorno configuradas en Vercel
- [ ] Primer deployment completado
- [ ] Test de conexión backend exitoso
- [ ] Login/Logout funcionando
- [ ] Análisis estático/modal funcionando

---

## 🎯 Próximos Pasos

1. **Dominio personalizado** (opcional):
   - Ve a Vercel → Settings → Domains
   - Agrega tu dominio (ej: `fem.unsaac.edu.pe`)

2. **Monitoreo**:
   - Vercel Analytics (gratis): Dashboard → Analytics
   - Render Logs: https://dashboard.render.com

3. **Performance**:
   - Activa Vercel Speed Insights
   - Considera Render Paid Plan para evitar cold starts
