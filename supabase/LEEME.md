# Servidor (Supabase)

Archivos SQL para ejecutar en **SQL Editor** de Supabase, en orden. Cada uno se puede ejecutar más de una vez sin romper nada.

| Archivo | Qué hace |
|---|---|
| `001-sincronizacion.sql` | Tabla `kv` con los datos de cada usuario (ya ejecutado) |
| `002-cuentas.sql` | Fase 1: tipos de cuenta, códigos de activación, solicitudes de entrenador y funciones de administración |

## Hacer desarrollador una cuenta

Después de crear la cuenta en la app:

```sql
update public.profiles set role = 'dev', activated_at = now() where email = lower('correo@ejemplo.com');
select email, name, role, blocked from public.profiles;
```
