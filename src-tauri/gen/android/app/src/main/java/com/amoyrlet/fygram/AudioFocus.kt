package com.amoyrlet.fygram

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.os.Handler
import android.os.Looper

/**
 * Steps aside when something else on the phone starts playing, and comes back
 * when it stops.
 *
 * Android arbitrates sound through audio focus: whoever holds it is the one
 * meant to be heard. Focus is asked for when playback starts and given up when
 * it ends - holding it while nothing plays only picks fights with whatever else
 * wants the speaker.
 *
 * Coming back is the awkward half. A *transient* loss - a notification, a short
 * video - ends with the system handing focus back, and that is all it takes.
 * A *permanent* loss is different: Android considers the matter settled and
 * never offers focus again, so the other app going quiet has to be noticed some
 * other way. That other way is [AudioManager.AudioPlaybackCallback], which the
 * system calls the instant any playback on the device starts or stops - no
 * polling, and no delay before the music comes back.
 */
object AudioFocus {
    private var manager: AudioManager? = null
    private var holding = false

    /** Whether it was this that stopped the music, and so this that may start it. */
    private var pausedByUs = false

    private val handler = Handler(Looper.getMainLooper())

    private val listener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                if (!pausedByUs) {
                    pausedByUs = true
                    holding = false
                    nativeForeignAudio(true)
                }
            }
            AudioManager.AUDIOFOCUS_GAIN -> resume()
        }
    }

    /** Fires the moment anything on the device starts or stops playing. */
    private val playbackWatch = object : AudioManager.AudioPlaybackCallback() {
        override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) {
            if (pausedByUs && !othersPlaying(configs) && request()) resume()
        }
    }

    /**
     * Whether anything other than this app is playing music.
     *
     * `isMusicActive` cannot answer that. Decoding is ffmpeg's job, but the
     * output end of the chain is rodio -> cpal -> oboe, and pausing only stops
     * the sink from pulling samples: the device stays open and keeps writing
     * silence, so this app's own stream reads as active however long it is
     * paused, and the device always looks busy. What can be counted on is that
     * exactly one of the active media streams is ours.
     */
    private fun othersPlaying(configs: List<AudioPlaybackConfiguration>): Boolean =
        configs.count { it.audioAttributes.usage == AudioAttributes.USAGE_MEDIA } > 1

    fun attach(context: Context) {
        val audio =
            context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        manager = audio
        audio.registerAudioPlaybackCallback(playbackWatch, handler)
    }

    /** Called when playback starts. */
    fun acquire() {
        pausedByUs = false
        request()
    }

    /** Called when playback ends: the speaker is somebody else's now. */
    @Suppress("DEPRECATION")
    fun release() {
        pausedByUs = false
        holding = false
        manager?.abandonAudioFocus(listener)
    }

    private fun resume() {
        if (pausedByUs) {
            pausedByUs = false
            nativeForeignAudio(false)
        }
        holding = true
    }

    @Suppress("DEPRECATION")
    private fun request(): Boolean {
        if (holding) return true
        val audio = manager ?: return false
        val granted = audio.requestAudioFocus(
            listener,
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN,
        ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        holding = granted
        return granted
    }

    @JvmStatic
    external fun nativeForeignAudio(playing: Boolean)
}
