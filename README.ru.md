<div align="center">

[english](README.md) · **русский**

<img src="https://raw.githubusercontent.com/amoyrlet-tg/fygram/main/public/icon.png" width="112" height="112" alt="fygram" />

# fygram

**твои телеграм-каналы как музыкальная библиотека.**

индексирует аудио в каналах, которые ты добавил, скачивает каждый трек
один раз и играет офлайн. плейлисты, поиск, «сейчас играет» в твоём профиле.

### [⬇ скачать последнюю версию](https://github.com/amoyrlet-tg/fygram/releases/latest)

[![release](https://img.shields.io/github/v/release/amoyrlet-tg/fygram?label=release&color=2aabee&style=for-the-badge)](https://github.com/amoyrlet-tg/fygram/releases/latest)
[![downloads](https://img.shields.io/github/downloads/amoyrlet-tg/fygram/total?color=2aabee&style=for-the-badge)](https://github.com/amoyrlet-tg/fygram/releases)
[![telegram](https://img.shields.io/badge/telegram-@amoyrlet-2aabee?style=for-the-badge)](https://t.me/amoyrlet)
[![stars](https://img.shields.io/github/stars/amoyrlet-tg/fygram?color=2aabee&style=for-the-badge)](https://github.com/amoyrlet-tg/fygram/stargazers)

сборки под все платформы лежат на
[странице релизов](https://github.com/amoyrlet-tg/fygram/releases/latest):
appimage, deb, dmg, exe, msi.

<br />

<img src="docs/screenshots/channel.png" width="940" alt="открытый канал в fygram" />

<sub>канал, который ты добавил, со всеми треками, что в нём выходили</sub>

</div>

<table>
<tr>
<td width="56%" valign="top">
<img src="docs/screenshots/playlist.png" alt="плейлист" />
<p align="center"><sub><b>плейлисты</b> из треков всех твоих каналов</sub></p>
</td>
<td width="44%" valign="top">
<img src="docs/screenshots/settings.png" alt="настройки" />
<p align="center"><sub><b>светлая и тёмная тема</b>, свой акцентный цвет, пять языков, запуск при старте системы</sub></p>
</td>
</tr>
</table>

---

## зачем

меня как слушателя музыки в тг бесит, что музыка в канале — это тупо сплошной
список сверху вниз. ни плейлистов, ни сортировки по авторам, вообще ничего из
того, что есть на любой нормальной музыкальной площадке.

ну и в честь этого біса написал fygram.

кидаешь канал → он превращается в библиотеку со всеми песнями, что там
когда-либо выходили, каждая качается один раз, в том виде, в каком лежала,
без пережатия, и дальше играет офлайн.

- плейлисты из песен со всех каналов, которые добавил
- поиск по всей библиотеке
- никакого посредника, между устройствами синхронит твоё избранное в тг
- «сейчас играет» уезжает в профиль
- музыка приглушается, когда звук издаёт тг или другой форк

## поставить

### арч

лежит в AUR, обновляется заодно со всей системой:

```sh
yay -S fygram-bin
```

### остальные

один файл со [страницы релизов](https://github.com/amoyrlet-tg/fygram/releases/latest):

- **linux** — бери `.AppImage`, правый клик → свойства → галка _разрешить
  запуск_. на debian, ubuntu и mint проще `.deb`: двойной клик, и он в меню
- **macos** — `.dmg`, перетащить fygram в applications. сборка одна и
  универсальная, идёт и на apple silicon, и на intel
- **windows** — `.exe`, запустить

на входе будут пугать: smartscreen в винде, «приложение повреждено» в макоси.
со сборкой всё нормально, она просто не подписана — подпись стоит денег, которых
я на это не тратил. в винде: **подробнее → всё равно выполнить**. в макоси
один раз:

```sh
xattr -dr com.apple.quarantine /Applications/fygram.app
```

## первый запуск

сервера у fygram нет. приложение ходит в телеграм само, а для этого ему нужны
твои api-ключи. [my.telegram.org/apps](https://my.telegram.org/apps) выдаёт их
за минуту, название приложения любое. дальше вставляешь **api_id** и
**api_hash** в fygram: они говорят, какое приложение стучится, а не кто ты, и с
твоего диска никуда не уходят.

потом кидаешь ссылку на канал и смотришь, как библиотека собирается сама.

## контакты

по всем вопросам в тг [@amoyrlet](https://t.me/amoyrlet)

## поддержать

⭐ — это то, как проект находят другие. а если хочешь закинуть монету,
ton/btc/trx/cryptobot есть в [моём био](https://amoyrlet-tg.github.io/#donations)

## на чём собрано

- [grammers](https://codeberg.org/Lonami/grammers) — mtproto-клиент от Lonami, на нём всё и держится
- [tauri](https://github.com/tauri-apps/tauri) и [react](https://github.com/facebook/react) — оболочка и интерфейс
- [rodio](https://github.com/RustAudio/rodio) с [symphonia](https://github.com/pdeljanov/Symphonia) — играют и декодируют
- [lofty](https://github.com/Serial-ATA/lofty-rs) — читает теги
- [motion](https://github.com/motiondivision/motion) — всё, что двигается
- [sqlx](https://github.com/launchbadge/sqlx) поверх [sqlite](https://www.sqlite.org) — хранит библиотеку

---

<div align="center">

[apache-2.0](LICENSE) · опциональная трансляция «сейчас играет» описана в [BROADCAST.md](BROADCAST.md)

</div>
