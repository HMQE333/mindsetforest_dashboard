package app.mindsetforest.phone

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import java.text.DateFormat
import java.util.Date

/**
 * The dashboard's reminders ("a message from the past") as phone
 * notifications, so they arrive with the dashboard closed. Each sync fetches
 * the ones due within a day: overdue ones show at once, the rest get an alarm
 * (inexact, allowed while idle: within minutes of the time). A reminder shows
 * once per phone.
 */
object Reminders {
    private const val CHANNEL = "reminders"

    fun canNotify(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    }

    fun apply(context: Context, store: Store, plan: ReminderPlan) {
        for (r in plan.now) {
            show(context, r)
            store.markReminderShown(r.id)
        }
        val alarms = context.getSystemService(AlarmManager::class.java)
        for (r in plan.later) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.deliverAt, alarmIntent(context, r))
        }
    }

    fun show(context: Context, r: Reminder) {
        if (!canNotify(context)) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.reminders_channel), NotificationManager.IMPORTANCE_HIGH),
        )
        val title = if (System.currentTimeMillis() - r.createdAt < 24 * 60 * 60_000L) {
            context.getString(R.string.reminder_title)
        } else {
            context.getString(R.string.reminder_from, DateFormat.getDateInstance(DateFormat.LONG).format(Date(r.createdAt)))
        }
        val site = Store(context).siteUrl
        val open = if (site.startsWith("https://")) Intent(Intent.ACTION_VIEW, Uri.parse(site)) else Intent(context, MainActivity::class.java)
        val tap = PendingIntent.getActivity(context, r.id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title)
            .setContentText(r.message)
            .setStyle(Notification.BigTextStyle().bigText(r.message))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build()
        nm.notify(r.id.hashCode(), n)
    }

    private fun alarmIntent(context: Context, r: Reminder): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java)
            .putExtra("id", r.id)
            .putExtra("message", r.message)
            .putExtra("deliverAt", r.deliverAt)
            .putExtra("createdAt", r.createdAt)
        return PendingIntent.getBroadcast(context, r.id.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}

/** An alarm set by Reminders: show the reminder unless this phone already did. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val store = Store(context)
        if (id in store.shownReminders) return
        val r = Reminder(
            id,
            intent.getStringExtra("message").orEmpty(),
            intent.getLongExtra("deliverAt", 0),
            intent.getLongExtra("createdAt", 0),
        )
        Reminders.show(context, r)
        store.markReminderShown(id)
    }
}
