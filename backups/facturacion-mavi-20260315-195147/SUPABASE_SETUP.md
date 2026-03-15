# Mavi Facturacion · Configuración rápida

## Flujo final
- No hay login.
- Cualquier persona con el link puede ver y editar.
- Pestañas: `Resumen`, `Cliente Facturación`, `Entre Nosotras`.

## 1) Configurar Supabase
1. Crea un proyecto en [https://supabase.com](https://supabase.com).
2. Ve a `Project Settings > API`.
3. Copia:
- `Project URL`
- `anon public key`

## 2) Crear tablas y permisos
1. Abre `SQL Editor`.
2. Ejecuta el archivo [supabase_schema.sql](/Users/ozanturanciftci/Desktop/Facturacion%20Mavi/supabase_schema.sql).

## 3) Activar realtime
En `Database > Replication` activa realtime para:
- `app_meta`
- `invoices`
- `settlements`

## 4) Añadir claves al frontend
Edita [config.js](/Users/ozanturanciftci/Desktop/Facturacion%20Mavi/config.js):

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
};
```

## 5) Ejecutar local
```bash
cd "/Users/ozanturanciftci/Desktop/Facturacion Mavi"
python3 -m http.server 8080
```

Abre:
- `http://localhost:8080/index.html`

## Nota de seguridad
Este modo es publico (sin login). Si compartes el link, cualquiera puede editar.
