package com.smallball.isoball;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends Activity {

    private WebView webView;

    // JS 桥：网页通过 window.AndroidApp 调用原生能力（目前只有退出游戏）
    public class JsBridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        // debug 包开启 WebView 远程调试：电脑 Chrome 打开 chrome://inspect 可直接看手机端
        // console/报错详情（配合网页内 ?errs=1 或 ?errbox=1 排查问题）
        WebView.setWebContentsDebuggingEnabled(true);
        webView.setBackgroundColor(0xFF171A1F);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new JsBridge(), "AndroidApp");
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // 前置摄像头/挖孔避让：全屏模式下页面会延伸进状态栏区（挖孔所在），
        // 给 WebView 顶部垫上状态栏高度的空隙，让 topbar 按键下移避开摄像头。
        webView.setPadding(0, getStatusBarHeight(), 0, 0);
        setContentView(webView);

        hideSystemUi();
        // ?app=1：告诉网页自己在手机 App 里跑（隐藏"导出/导入存档"等只在浏览器里有意义的入口）
        webView.loadUrl("file:///android_asset/www/index.html?app=1");
    }

    private int getStatusBarHeight() {
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        // 兜底 84px（≈28dp×3）：即使取不到状态栏高度也足够避开典型挖孔摄像头
        return id > 0 ? getResources().getDimensionPixelSize(id) : 84;
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        hideSystemUi();
    }

    @Override
    public void onBackPressed() {
        // 游戏是单页应用，直接最小化而不是退出
        moveTaskToBack(true);
    }
}
