# Guía de Migración - Actualización del Schema

## Problema

Si estás obteniendo un error 500 al crear trabajos, probablemente es porque la tabla `job_proposals` no existe en la base de datos. Esto sucede cuando el schema de Prisma se actualiza pero la base de datos no se ha sincronizado.

## Solución

Ejecuta estos comandos para actualizar la base de datos:

```bash
# 1. Generar el cliente de Prisma con el nuevo schema
npm run db:generate

# 2. Sincronizar el schema con la base de datos (esto creará las tablas faltantes)
npm run db:push

# O si prefieres crear una migración:
npm run db:migrate
```

## Verificación

Después de ejecutar los comandos, verifica que todo esté correcto:

```bash
# Abrir Prisma Studio para ver las tablas
npm run db:studio
```

Deberías ver:
- ✅ `users`
- ✅ `jobs`
- ✅ `job_proposals` (nueva tabla)
- ✅ `reviews`

## Nota

El código ahora está preparado para manejar la ausencia temporal de la tabla `proposals`, pero para el funcionamiento completo necesitas tener todas las tablas creadas.

