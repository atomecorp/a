package one.atome.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// An alarm's time (AtomeAlarms.arm): its ring starts; a restart, an update or a clock change: every alarm is armed again.
class AtomeAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AtomeAlarms.ACTION_FIRE) { AtomeAlarms.rearm(context); return }
        val id = intent.getStringExtra(AtomeAlarms.EXTRA_ID) ?: return
        val descriptor = AtomeAlarms.fired(context, id) ?: return
        context.startForegroundService(Intent(context, AtomeAlarmService::class.java).setAction(AtomeAlarmService.ACTION_RING)
            .putExtra(AtomeAlarmService.EXTRA_DESCRIPTOR, descriptor.toString()))
    }
}
