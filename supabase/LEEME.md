# Servidor (Supabase)

Archivos SQL para ejecutar en **SQL Editor** de Supabase, en orden. Cada uno se puede ejecutar más de una vez sin romper nada.

| Archivo | Qué hace |
|---|---|
| `001-sincronizacion.sql` | Tabla `kv` con los datos de cada usuario (ya ejecutado) |
| `002-cuentas.sql` | Fase 1: tipos de cuenta, códigos de activación, solicitudes de entrenador y funciones de administración (ya ejecutado) |
| `003-entrenadores.sql` | Fase 2: código fijo de cada entrenador, vínculo con sus clientes (solicitar, aceptar, rechazar, pausar, desvincular), plazo de 15 días al dejar de ser entrenador y solicitud de ampliarlo (ya ejecutado) |
| `004-ficha-cliente.sql` | Fase 3: el entrenador ve, sin poder cambiarlos, el diario, los entrenos, el peso, las medidas y los objetivos de sus clientes (ya ejecutado) |
| `005-notas-objetivos.sql` | Fase 4: notas del entrenador (privadas o visibles para el cliente) y propuestas de objetivos que el cliente acepta o rechaza (ya ejecutado) |
| `006-plantillas.sql` | Fase 5: plantillas del entrenador (planes del día y recetas) que comparte con los clientes que elija |

## Hacer desarrollador una cuenta

Después de crear la cuenta en la app:

```sql
update public.profiles set role = 'dev', activated_at = now() where email = lower('correo@ejemplo.com');
select email, name, role, blocked from public.profiles;
```
