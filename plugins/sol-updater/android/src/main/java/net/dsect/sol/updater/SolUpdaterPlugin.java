package net.dsect.sol.updater;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Self-update support for sideloaded Sol APKs.
 *
 * <p>downloadUpdate() fetches an APK with DownloadManager into the app-private
 * external files dir and emits "downloadProgress" events while it runs.
 * installUpdate() launches the package installer for the downloaded APK through
 * this plugin's FileProvider. getInstallPermission() /
 * openInstallPermissionSettings() help guide the user through Android's
 * "install unknown apps" consent (required once per app on Android 8+).
 */
@CapacitorPlugin(name = "SolUpdater")
public class SolUpdaterPlugin extends Plugin {

    private static final String EVENT_PROGRESS = "downloadProgress";
    // Reuses the FileProvider declared by the Capacitor app template
    // (authority "<package>.fileprovider") — declaring a second provider
    // for the same class breaks the manifest merger.
    private static final String FILE_PROVIDER_SUFFIX = ".fileprovider";
    private static final String UPDATES_SUBDIR = "updates";
    private static final String APK_MIME = "application/vnd.android.package-archive";

    private DownloadManager downloadManager;
    private long downloadId = -1;
    private PluginCall downloadCall;
    private File apkFile;
    private BroadcastReceiver receiver;
    private volatile boolean polling;

    @Override
    public void load() {
        downloadManager =
                (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "sol-experimental.apk");
        if (url == null || url.isEmpty()) {
            call.reject("Missing download url");
            return;
        }
        if (downloadId != -1) {
            call.reject("A download is already in progress");
            return;
        }
        if (downloadManager == null) {
            call.reject("DownloadManager is not available on this device");
            return;
        }

        File dir =
                new File(
                        getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                        UPDATES_SUBDIR);
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Could not create the download directory");
            return;
        }
        apkFile = new File(dir, fileName);
        if (apkFile.exists() && !apkFile.delete()) {
            call.reject("Could not clear a previous download");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Sol update");
        request.setDescription("Downloading update");
        request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationUri(Uri.fromFile(apkFile));
        request.setAllowedOverMetered(true);
        request.setAllowedOverRoaming(true);
        request.setMimeType(APK_MIME);

        downloadCall = call;
        call.setKeepAlive(true);
        try {
            downloadId = downloadManager.enqueue(request);
        } catch (Exception e) {
            downloadCall = null;
            call.reject("Could not start the download: " + e.getMessage());
            return;
        }

        receiver =
                new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        long id =
                                intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                        if (id == downloadId) {
                            finishDownload();
                        }
                    }
                };
        ContextCompat.registerReceiver(
                getContext(),
                receiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_NOT_EXPORTED);

        polling = true;
        new Thread(this::pollProgress).start();
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        if (apkFile == null || !apkFile.exists()) {
            call.reject("No downloaded update found. Download it first.");
            return;
        }
        Context context = getContext();
        Uri uri =
                FileProvider.getUriForFile(
                        context, context.getPackageName() + FILE_PROVIDER_SUFFIX, apkFile);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, APK_MIME);
        intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            context.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the installer: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getInstallPermission(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            granted = getContext().getPackageManager().canRequestPackageInstalls();
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        Context context = getContext();
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent =
                    new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + context.getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        polling = false;
        downloadId = -1;
        try {
            if (receiver != null) {
                getContext().unregisterReceiver(receiver);
            }
        } catch (Exception ignored) {
            // Already unregistered.
        }
        receiver = null;
        if (downloadCall != null) {
            downloadCall.reject("Update download cancelled");
            downloadCall = null;
        }
    }

    private void pollProgress() {
        while (polling && downloadId != -1) {
            DownloadManager.Query query =
                    new DownloadManager.Query().setFilterById(downloadId);
            try (Cursor c = downloadManager.query(query)) {
                if (c != null && c.moveToFirst()) {
                    long downloaded =
                            c.getLong(
                                    c.getColumnIndex(
                                            DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total =
                            c.getLong(
                                    c.getColumnIndex(
                                            DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    int status =
                            c.getInt(c.getColumnIndex(DownloadManager.COLUMN_STATUS));
                    JSObject data = new JSObject();
                    data.put("bytesDownloaded", downloaded);
                    data.put("bytesTotal", total);
                    data.put("progress", total > 0 ? (int) (downloaded * 100 / total) : 0);
                    notifyListeners(EVENT_PROGRESS, data);
                    if (status == DownloadManager.STATUS_SUCCESSFUL
                            || status == DownloadManager.STATUS_FAILED) {
                        break;
                    }
                }
            } catch (Exception ignored) {
                // Keep polling; completion is also signalled by broadcast.
            }
            try {
                Thread.sleep(500);
            } catch (InterruptedException ignored) {
                break;
            }
        }
    }

    private void finishDownload() {
        polling = false;
        long id = downloadId;
        downloadId = -1;
        try {
            if (receiver != null) {
                getContext().unregisterReceiver(receiver);
            }
        } catch (Exception ignored) {
            // Already unregistered.
        }
        receiver = null;

        PluginCall call = downloadCall;
        downloadCall = null;
        if (call == null) {
            return;
        }

        boolean ok = false;
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        try (Cursor c = downloadManager.query(query)) {
            if (c != null && c.moveToFirst()) {
                int status = c.getInt(c.getColumnIndex(DownloadManager.COLUMN_STATUS));
                ok = status == DownloadManager.STATUS_SUCCESSFUL;
            }
        } catch (Exception ignored) {
            // Treated as failure below.
        }

        if (ok && apkFile != null && apkFile.exists()) {
            JSObject ret = new JSObject();
            ret.put("path", apkFile.getAbsolutePath());
            call.resolve(ret);
        } else {
            if (apkFile != null && apkFile.exists() && !apkFile.delete()) {
                // Best effort cleanup.
            }
            apkFile = null;
            call.reject("The update download failed");
        }
    }
}
