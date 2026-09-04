package com.amoyrlet.fygram

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder

/**
 * The player Android itself draws: the card in the notification shade and on the
 * lock screen.
 *
 * It is a foreground service because that is the only way music keeps playing
 * once the window is gone - Android stops an ordinary process a few seconds
 * after it stops being visible.
 *
 * The service holds no state of its own. Rust says what is playing and whether
 * it is playing; the buttons here go back the same way.
 */
class PlaybackService : Service() {
    private var session: MediaSession? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        channel()
        session = MediaSession(this, "fygram").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = MediaNotification.transport(TRANSPORT_PLAY)
                override fun onPause() = MediaNotification.transport(TRANSPORT_PAUSE)
                override fun onSkipToNext() = MediaNotification.transport(TRANSPORT_NEXT)
                override fun onSkipToPrevious() = MediaNotification.transport(TRANSPORT_PREVIOUS)
                override fun onStop() = MediaNotification.transport(TRANSPORT_PAUSE)
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: ""
        val artist = intent?.getStringExtra(EXTRA_ARTIST) ?: ""
        val cover = intent?.getStringExtra(EXTRA_COVER)
        val duration = intent?.getLongExtra(EXTRA_DURATION, 0L) ?: 0L
        val position = intent?.getLongExtra(EXTRA_POSITION, 0L) ?: 0L
        val playing = intent?.getBooleanExtra(EXTRA_PLAYING, false) ?: false

        val art = cover?.let { runCatching { BitmapFactory.decodeFile(it) }.getOrNull() }
        val current = session ?: return START_NOT_STICKY

        current.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, duration)
                .apply { if (art != null) putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art) }
                .build()
        )
        current.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or
                        PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS
                )
                // 1.0 while playing is what lets Android move the progress bar
                // on its own, without a message per second from us
                .setState(
                    if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                    position,
                    if (playing) 1.0f else 0.0f,
                )
                .build()
        )

        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(open)
            .setOngoing(playing)
            .apply { if (art != null) setLargeIcon(art) }
            .setStyle(Notification.MediaStyle().setMediaSession(current.sessionToken))
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            @Suppress("DEPRECATION")
            startForeground(NOTIFICATION_ID, notification, FOREGROUND_TYPE_MEDIA)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        session?.release()
        session = null
        super.onDestroy()
    }

    private fun channel() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            }
        )
    }

    companion object {
        const val CHANNEL = "playback"
        const val NOTIFICATION_ID = 1
        const val FOREGROUND_TYPE_MEDIA = 2 // FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK

        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"
        const val EXTRA_COVER = "cover"
        const val EXTRA_DURATION = "duration"
        const val EXTRA_POSITION = "position"
        const val EXTRA_PLAYING = "playing"

        const val TRANSPORT_PLAY = 0
        const val TRANSPORT_PAUSE = 1
        const val TRANSPORT_NEXT = 2
        const val TRANSPORT_PREVIOUS = 3
    }
}
