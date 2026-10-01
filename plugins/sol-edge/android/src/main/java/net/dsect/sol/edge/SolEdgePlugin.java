package net.dsect.sol.edge;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * Edge-to-edge Sol.
 *
 * <p>Scott, 2026-10-01: "the app is in full screen but still leaves room for the camera bezel and
 * the bottom of the phone." So the window draws behind the status bar, into the camera cutout and
 * behind the gesture/navigation bar (Sol's own colours fill the whole screen), and the page is
 * told exactly how much room to leave at each edge.
 *
 * <p>The insets are measured here and handed to the page as CSS custom properties
 * (--sol-inset-top/right/bottom/left, in CSS pixels) rather than trusting env(safe-area-inset-*):
 * Android WebViews have reported those as 0 for an edge-to-edge app on many versions, which would
 * put the header under the camera. The CSS takes the larger of the two.
 *
 * <p>The keyboard. Once an app draws edge-to-edge (decorFitsSystemWindows = false) Android stops
 * resizing the window for the soft keyboard, which would leave the composer under it. So the IME
 * inset is applied as bottom padding on the WebView's container: the WebView shrinks exactly as
 * it did before, and while the keyboard is up the bottom inset given to the page is 0 (the
 * gesture bar is behind the keyboard).
 */
@CapacitorPlugin(name = "SolEdge")
public class SolEdgePlugin extends Plugin {

    private float density = 1f;
    private int top, bottom, left, right, keyboard;

    @Override
    public void load() {
        density = getContext().getResources().getDisplayMetrics().density;
        getActivity().runOnUiThread(this::goEdgeToEdge);
    }

    private void goEdgeToEdge() {
        Window window = getActivity().getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // No grey scrim behind the 3-button bar or the gesture handle: the page paints there.
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // Draw into the camera cutout too; the page keeps its content clear with the inset.
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        WebView webView = getBridge().getWebView();
        View container = (View) webView.getParent();
        ViewCompat.setOnApplyWindowInsetsListener(container, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            keyboard = Math.max(0, ime.bottom - bars.bottom);
            // The container shrinks above the keyboard, as adjustResize used to do.
            v.setPadding(0, 0, 0, ime.bottom > 0 ? ime.bottom : 0);
            top = bars.top;
            left = bars.left;
            right = bars.right;
            bottom = ime.bottom > 0 ? 0 : bars.bottom;
            push();
            // The container already shrank by the keyboard; hand the WebView insets WITHOUT it, or
            // a recent WebView (interactive-widget=resizes-content) shrinks again and leaves a
            // keyboard-sized gap (review, PR #8). Bars stay, so env() keeps working.
            return new WindowInsetsCompat.Builder(insets)
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .build();
        });
        ViewCompat.requestApplyInsets(container);
    }

    private float css(int px) {
        return px / density;
    }

    /** Write the insets onto the page (re-sent by getInsets() after a reload). */
    private void push() {
        String js = String.format(Locale.US,
                "(function(s){s.setProperty('--sol-inset-top','%.1fpx');s.setProperty('--sol-inset-right','%.1fpx');"
                        + "s.setProperty('--sol-inset-bottom','%.1fpx');s.setProperty('--sol-inset-left','%.1fpx');"
                        + "s.setProperty('--sol-keyboard','%.1fpx');})(document.documentElement.style)",
                css(top), css(right), css(bottom), css(left), css(keyboard));
        WebView webView = getBridge().getWebView();
        webView.post(() -> webView.evaluateJavascript(js, null));
        JSObject data = insetsObject();
        notifyListeners("insetsChanged", data);
    }

    private JSObject insetsObject() {
        JSObject o = new JSObject();
        o.put("top", css(top));
        o.put("right", css(right));
        o.put("bottom", css(bottom));
        o.put("left", css(left));
        o.put("keyboard", css(keyboard));
        o.put("native", true);
        return o;
    }

    /** The current insets, in CSS pixels; also re-applies them to the page. */
    @PluginMethod
    public void getInsets(PluginCall call) {
        push();
        call.resolve(insetsObject());
    }

    /** dark = true: light icons for a dark page; false: dark icons for a light page. */
    @PluginMethod
    public void setBarStyle(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, window.getDecorView());
            c.setAppearanceLightStatusBars(!dark);
            c.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
