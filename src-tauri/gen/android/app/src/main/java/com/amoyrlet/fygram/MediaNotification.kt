package com.amoyrlet.fygram

import android.content.Context
import android.content.Intent

/**
 * The seam between the player, which is Rust, and the card Android draws.
 *
 * Rust calls [update] whenever what is playing changes; the buttons on the card
 * come back through [transport] and are handed to the same code that serves the
 * buttons in the app itself.
 */
object MediaNotification {
    private var context: Context? = null

    fun attach(context: Context) {
        this.context = context.applicationContext
    }

    /** Called from Rust. Cover may be empty when the track carries no artwork. */
    @JvmStatic
    fun update(
        title: String,
        artist: String,
        cover: String,
        durationMs: Long,
        positionMs: Long,
        playing: Boolean,
    ) {
        val ctx = context ?: return
        if (playing) AudioFocus.acquire()
        val intent = Intent(ctx, PlaybackService::class.java)
            .putExtra(PlaybackService.EXTRA_TITLE, title)
            .putExtra(PlaybackService.EXTRA_ARTIST, artist)
            .putExtra(PlaybackService.EXTRA_COVER, cover.ifEmpty { null })
            .putExtra(PlaybackService.EXTRA_DURATION, durationMs)
            .putExtra(PlaybackService.EXTRA_POSITION, positionMs)
            .putExtra(PlaybackService.EXTRA_PLAYING, playing)
        ctx.startForegroundService(intent)
    }

    /** Called from Rust when playback ends: the card goes away with the service. */
    @JvmStatic
    fun dismiss() {
        AudioFocus.release()
        val ctx = context ?: return
        ctx.stopService(Intent(ctx, PlaybackService::class.java))
    }

    /** A button on the card. Implemented in Rust. */
    @JvmStatic
    external fun transport(action: Int)
}
