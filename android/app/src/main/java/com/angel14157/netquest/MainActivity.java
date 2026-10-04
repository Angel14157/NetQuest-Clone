package com.angel14157.netquest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowInsets;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * NetQuest — WebView que carga la app web desde assets (file:///android_asset).
 * localStorage queda habilitado para guardar progreso del curso, examen y ejercicios.
 */
public class MainActivity extends Activity {

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);            // la app es 100% JS
        s.setDomStorageEnabled(true);            // localStorage (nq-progress, nq-exam-best, nq-custom)
        s.setUseWideViewPort(true);              // respeta <meta viewport>
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.setBackgroundColor(0xFF0B0D13);       // fondo oscuro al arrancar (sin "flash" blanco)
        web.setWebViewClient(new WebViewClient());

        applySystemInsets();

        if (savedInstanceState == null) {
            web.loadUrl("file:///android_asset/index.html");
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    /**
     * La app NO se dibuja debajo de las barras del sistema (hora/batería arriba,
     * gestos/inicio abajo): la ventana queda "a sangre" y nosotros aplicamos la
     * altura de las barras como margen real del WebView. Se escucha en la vista
     * raíz de la ventana, que siempre recibe los insets completos.
     */
    private void applySystemInsets() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;  // pre-Android 11: decor ya los aplica
        getWindow().setDecorFitsSystemWindows(false);
        getWindow().getDecorView().setOnApplyWindowInsetsListener((v, insets) -> {
            int mask = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
            Insets m = insets.getInsets(mask);
            // margen por barras del sistema y, si está abierto, por el teclado
            // (así ningún botón ni input queda debajo de nada)
            Insets ime = insets.getInsets(WindowInsets.Type.ime());
            web.setPadding(m.left, m.top, m.right, Math.max(m.bottom, ime.bottom));
            return insets;
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // botón atrás = retroceso dentro de la app antes de salir
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
