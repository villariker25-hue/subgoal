# Sub goal para OBS

Barra de objetivo de subs para Twitch que cuenta sola. Es para un colega de Iker.

- `panel.html`: dock de OBS. Se conecta a Twitch (EventSub por WebSocket), cuenta los subs y deja editar la meta y el diseño.
- `overlay.html`: fuente de navegador en OBS. Solo pinta lo que hay en Firebase.
- `index.html`: instrucciones paso a paso para el colega.
- `comun.js`: configuración (Client ID de Twitch y Firebase), streaming de Firebase y cálculo del contador.

## Cómo funciona

- El panel y el overlay se comunican por Firebase, en la misma RTDB que gastos-casa (`hogares/subgoal-<código>`). El código va en la URL `?c=`.
- El token de Twitch se queda en el navegador del panel. Nunca se sube a Firebase.
- Cada sub se guarda con el id del mensaje de Twitch. Si hay dos paneles abiertos, no se cuenta doble.
- Los subs regalados cuentan una sola vez: el evento `channel.subscribe` con `is_gift` se ignora y cuenta el de `channel.subscription.gift`.
- Los resubs solo llegan cuando el viewer comparte el mensaje de resub. Es una limitación de Twitch.
- Modo «total»: lee `GET /helix/subscriptions` (`total` y `points`) cada 30 s.

## Puesta en marcha (una vez)

1. **Publicar**: repo público `villariker25-hue/subgoal` con GitHub Pages, en
   `https://villariker25-hue.github.io/subgoal/`.
2. **Registrar la app de Twitch** en https://dev.twitch.tv/console/apps. Hace falta tener la verificación en dos pasos activada en Twitch.
   - Nombre: el que quieras (por ejemplo, "Subgoal Overlay Iker").
   - URL de redirección OAuth: `https://villariker25-hue.github.io/subgoal/panel.html`.
   - Categoría: Broadcasting Suite. Tipo de cliente: **Público**.
   - Copia el Client ID en `TWITCH_CLIENT_ID` (`comun.js`) y vuelve a publicar.
3. Mándale al colega `https://villariker25-hue.github.io/subgoal/`. Ahí tiene las instrucciones.

El Client ID no es secreto: con el tipo «Público» no hay client secret.

Al cambiar `comun.js`, sube el `?v=` de su `<script>` en panel.html y overlay.html para que OBS no use la versión en caché.

## Probar en local

Configuración `twitch-subgoal` en `.claude/launch.json` (puerto 5660). Twitch solo deja entrar desde la URL registrada. En local se pueden simular subs desde la consola del panel:

```js
__subgoal.registrar("id1", "channel.subscribe", { user_name: "Paco", tier: "1000", is_gift: false }, new Date().toISOString())
```
