# AGENTS.md

## Estilo de trabajo

Priorizá el bajo consumo de tokens. Hacé el cambio pedido y nada más — no corras
tests, no levantes el server, no verifiques en browser salvo que se pida
explícitamente. Eso lo prueba el mantenedor.

Nunca uses emojis (ni en código, comentarios, notas o commits). No agregues
líneas de co-autoría en los commits.

## Estándares del repo

Piso mínimo y entrega:

- README de cinco minutos, `.env.example` con
  validación al arrancar, verificación automática antes de que el código entre,
  logs útiles, fechas en UTC.
- Conventional Commits, versión
  semántica con etiqueta de git, `CHANGELOG.md` escrito para quien lo usa.

Qué NO aplica: corre entero en el navegador, sin servidor ni variables de
entorno. El `CHANGELOG.md` es lo que la app muestra en el aviso de novedades:
se escribe para quien la usa y no lleva detalles internos (refactors, CI,
dependencias). Eso queda en los mensajes de commit.
