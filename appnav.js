/* App switcher: a small dropdown in the upper-right corner of every app.
   Shared by all pages — edit the APPS list below to add or rename an app. */
(function(){
  "use strict";
  // Hidden on the read-only client view of the Job Tracker.
  if(new URLSearchParams(location.search).get("view") === "1") return;

  var APPS = [
    ["Apps", "apps.html"],
    ["Daily Focus", "index.html"],
    ["Job Tracker", "project.html"],
    ["Medical Log", "medical.html"],
    ["Money", "money.html"]
  ];
  var current = location.pathname.split("/").pop() || "index.html";

  var css =
    ".appnav{position:absolute;z-index:1000;top:calc(env(safe-area-inset-top,0px) + 12px);" +
      "right:calc(max(0px,(100vw - 640px)/2) + 20px);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    ".appnav-btn{display:flex;align-items:center;justify-content:center;width:34px;height:26px;padding:0;" +
      "background:#FAFAF8;color:#141414;border:1.4px solid #141414;border-radius:6px;cursor:pointer}" +
    ".appnav-btn:active,.appnav.open .appnav-btn{background:#E3792F;color:#1D1D1B;border-color:#1D1D1B}" +
    ".appnav-btn svg{width:14px;height:14px;transition:transform .15s}" +
    ".appnav.open .appnav-btn svg{transform:rotate(180deg)}" +
    ".appnav-menu{display:none;position:absolute;right:0;top:32px;min-width:178px;background:#FAFAF8;" +
      "border:1.6px solid #141414;border-radius:8px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.14)}" +
    ".appnav.open .appnav-menu{display:block}" +
    ".appnav-menu a{display:block;padding:12px 14px;font-size:14px;font-weight:800;color:#141414;text-decoration:none;" +
      "border-left:5px solid transparent;border-bottom:1px solid #e3e3df}" +
    ".appnav-menu a:last-child{border-bottom:none}" +
    ".appnav-menu a:active{background:#f0f0ec}" +
    ".appnav-menu a.cur{border-left-color:#E3792F;background:#f0f0ec}" +
    "@media print{.appnav{display:none}}";

  function build(){
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "appnav";
    wrap.innerHTML =
      '<button class="appnav-btn" type="button" aria-label="Switch app" aria-haspopup="true" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="appnav-menu">' +
        APPS.map(function(a){
          return '<a href="' + a[1] + '"' + (a[1] === current ? ' class="cur" aria-current="page"' : '') + '>' + a[0] + '</a>';
        }).join("") +
      '</div>';
    document.body.appendChild(wrap);

    var btn = wrap.querySelector(".appnav-btn");
    function setOpen(open){
      wrap.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    btn.addEventListener("click", function(e){
      e.stopPropagation();
      setOpen(!wrap.classList.contains("open"));
    });
    document.addEventListener("click", function(e){
      if(!wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape") setOpen(false);
    });
  }

  if(document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
