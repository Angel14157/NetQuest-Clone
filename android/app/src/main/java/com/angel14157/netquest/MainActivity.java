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
    private int inLeft, inTop, inRight, inBottom;   // últimos insets del sistema, en px

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
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // la web sabe qué APK la ejecuta (si no hay función, es la PWA y no hace nada)
                view.evaluateJavascript(
                        "window.__nqApkVer&&window.__nqApkVer('" + BuildConfig.VERSION_NAME + "')", null);
                pushInsets();   // re-aplica el margen: la página acaba de cargarse
            }
        });

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
            // A veces (gestos sin barra declarada, p. ej. ColorOS) el sistema reporta
            // 0 abajo aunque el indicador de inicio se dibuje ENCIMA del contenido:
            // se reserva espacio con respaldos hasta encontrar altura real.
            int bottom = m.bottom;
            if (bottom == 0) bottom = insets.getStableInsetBottom();
            if (bottom == 0) bottom = navBarHeight();
            // región real de gestos de la pantalla (ColorOS a veces solo reporta esta)
            if (bottom == 0) bottom = insets.getInsets(WindowInsets.Type.systemGestures()).bottom;
            // margen por barras y, si está abierto, por el teclado:
            // así ningún botón ni input queda debajo de nada.
            Insets ime = insets.getInsets(WindowInsets.Type.ime());
            // piso de seguridad: en modo gestos el indicador SIEMPRE se dibuja
            // aunque el sistema reporte 0 — nunca se reserva menos que eso.
            int floor = (int) (32 * getResources().getDisplayMetrics().density);
            inLeft = m.left; inTop = m.top; inRight = m.right;
            inBottom = Math.max(Math.max(bottom, ime.bottom), floor);
            pushInsets();
            return insets;
        });
    }

    /**
     * Aplica el margen inferior por DOS vías:
     *  - padding al WebView → alcanza al contenido normal (tabla, formularios);
     *  - variable CSS --nq-inset-bottom → alcanza a los elementos position:fixed
     *    (la hoja inferior), que el padding NO mueve: se ancla a la ventana y
     *    quedaba debajo de los botones de navegación del sistema.
     */
    private void pushInsets() {
        web.setPadding(inLeft, inTop, inRight, inBottom);
        float dp = inBottom / getResources().getDisplayMetrics().density;   // px → CSS px
        web.evaluateJavascript(
                "document.documentElement.style.setProperty('--nq-inset-bottom','" + dp + "px')", null);
    }

    /** Altura declarada de la barra de navegación en el recurso del sistema (puede ser 0). */
    private int navBarHeight() {
        int id = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
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
