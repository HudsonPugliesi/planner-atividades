(function(){
  "use strict";

  var STATUS = {
    progress: {label:"Em andamento", cls:"s-progress", color:"#f5a623"},
    done:     {label:"Feito",        cls:"s-done",     color:"#28c76f"},
    stuck:    {label:"Parado",       cls:"s-stuck",     color:"#e2445c"},
    empty:    {label:"—",            cls:"s-empty",     color:null}
  };

  function uid(){ return Math.random().toString(36).slice(2,10); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function fmtShort(iso){
    if(!iso) return "";
    var d = new Date(iso+"T00:00:00");
    return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}).replace(".","");
  }
  function initials(name){
    return (name||"?").trim().split(/\s+/).slice(0,2).map(function(w){return w[0]||"";}).join("").toUpperCase();
  }

  function defaultData(){
    return {
      title: "Atividades",
      groups: [
        {
          id: uid(), name: "Tarefas pendentes", color: "#5b57ea", collapsed:false,
          tasks: [
            {id:uid(), name:"Tarefa 1", owner:"Hudson", status:"progress", start:"2026-09-20", end:"2026-09-21", files:false},
            {id:uid(), name:"Tarefa 2", owner:"", status:"done", start:"2026-09-22", end:"2026-09-23", files:true},
            {id:uid(), name:"Tarefa 3", owner:"", status:"stuck", start:"2026-09-24", end:"2026-09-25", files:false}
          ]
        },
        {
          id: uid(), name: "Concluído", color: "#28c76f", collapsed:false,
          tasks: []
        }
      ]
    };
  }

  var STORE_KEY = "planner-monday-style-v1";

  function normalize(d){
    if(!d || !d.groups) d = defaultData();
    // Migração: versões antigas podiam acumular um intervalo de datas ao
    // reeditar o Prazo várias vezes; normaliza para um único dia (start = end).
    d.groups.forEach(function(g){
      g.tasks.forEach(function(t){
        if(t.end) t.start = t.end;
      });
    });
    return d;
  }

  var data = null;
  try{
    var raw = localStorage.getItem(STORE_KEY);
    data = raw ? JSON.parse(raw) : defaultData();
  }catch(e){ data = defaultData(); }
  data = normalize(data);

  var remoteSaveTimer = null;
  function queueRemoteSave(){
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(function(){
      fetch("/api/board", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(data)
      }).catch(function(){ /* offline ou API indisponível: fica só no localStorage por enquanto */ });
    }, 500);
  }

  function save(){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(data)); }catch(e){}
    queueRemoteSave();
  }

  var boardEl = document.getElementById("view-board");
  var calEl = document.getElementById("view-calendar");
  var subEl = document.getElementById("task-count-sub");
  var titleEl = document.getElementById("board-title");

  titleEl.textContent = data.title || "Atividades";
  titleEl.contentEditable = "true";
  titleEl.addEventListener("blur", function(){
    data.title = titleEl.textContent.trim() || "Atividades";
    save();
  });

  function allTasks(){
    var out = [];
    data.groups.forEach(function(g){ g.tasks.forEach(function(t){ out.push(t); }); });
    return out;
  }

  function statusBarHtml(t){
    if(!t.start && !t.end){
      return '<div class="timeline-bar empty">Definir datas</div>';
    }
    var s = STATUS[t.status] || STATUS.empty;
    var color = s.color || "#a6a9c4";
    var label = (t.start? fmtShort(t.start):"") + (t.end && t.end!==t.start ? " – "+fmtShort(t.end) : "");
    return '<div class="timeline-bar" style="background:'+color+'">'+label+'</div>';
  }

  function renderBoard(){
    var html = "";
    data.groups.forEach(function(g, gi){
      html += '<div class="group '+(g.collapsed?'collapsed':'')+'" data-gid="'+g.id+'" style="--gcolor:'+g.color+'">';
      html += '<div class="group-head" data-toggle="'+g.id+'">';
      html += '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';
      html += '<h2 contenteditable="true" data-rename-group="'+g.id+'">'+escapeHtml(g.name)+'</h2>';
      html += '<span class="count">'+g.tasks.length+' tarefa'+(g.tasks.length===1?'':'s')+'</span>';
      html += '</div>';

      html += '<table class="table"><colgroup>'+
        '<col class="c-task"><col class="c-owner"><col class="c-status"><col class="c-due"><col class="c-files"><col class="c-timeline"><col class="c-del">'+
        '</colgroup>';
      html += '<thead><tr><th>Tarefa</th><th>Responsável</th><th>Status</th><th>Prazo</th><th>Arquivos</th><th>Cronograma</th><th></th></tr></thead>';
      html += '<tbody>';
      g.tasks.forEach(function(t){
        var s = STATUS[t.status] || STATUS.empty;
        html += '<tr data-tid="'+t.id+'" data-gid="'+g.id+'">';
        html += '<td><input class="task-name" value="'+escapeAttr(t.name)+'" placeholder="Nome da tarefa" data-field="name"></td>';
        html += '<td><div class="avatar" title="'+escapeAttr(t.owner||'Sem responsável')+'" data-field="owner-toggle">'+(t.owner?initials(t.owner):'+')+'</div></td>';
        html += '<td><select class="pill '+s.cls+'" data-field="status">'+
          Object.keys(STATUS).filter(function(k){return k!=="empty";}).map(function(k){
            return '<option value="'+k+'" '+(t.status===k?'selected':'')+'>'+STATUS[k].label+'</option>';
          }).join('')+
          '</select></td>';
        html += '<td><input type="date" class="date-in" value="'+(t.end||'')+'" data-field="end"></td>';
        html += '<td><button class="files-btn '+(t.files?'has':'')+'" data-field="files-toggle" title="'+(t.files?'Tem arquivo':'Anexar arquivo')+'">'+
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>'+
          '</button></td>';
        html += '<td>'+statusBarHtml(t)+'</td>';
        html += '<td><button class="del-btn" data-field="delete" title="Excluir">'+
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>'+
          '</button></td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      html += '<div class="add-row" data-addtask="'+g.id+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>Adicionar tarefa</div>';
      html += '</div>';
    });
    html += '<div class="add-group" id="add-group-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>Adicionar novo grupo</div>';
    boardEl.innerHTML = html;
    var n = allTasks().length;
    subEl.textContent = n + (n===1 ? " tarefa" : " tarefas");
  }

  function escapeHtml(str){
    return (str||"").replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function escapeAttr(str){ return escapeHtml(str); }

  // ---- Board interactions (event delegation) ----
  boardEl.addEventListener("click", function(e){
    var toggle = e.target.closest("[data-toggle]");
    if(toggle){
      var g = data.groups.find(function(g){return g.id===toggle.getAttribute("data-toggle");});
      g.collapsed = !g.collapsed;
      save(); renderBoard();
      return;
    }
    var addTask = e.target.closest("[data-addtask]");
    if(addTask){
      var gid = addTask.getAttribute("data-addtask");
      var g2 = data.groups.find(function(g){return g.id===gid;});
      g2.tasks.push({id:uid(), name:"", owner:"", status:"progress", start:todayISO(), end:todayISO(), files:false});
      save(); renderBoard();
      var row = boardEl.querySelector('tr[data-gid="'+gid+'"]:last-child input.task-name');
      if(row) row.focus();
      return;
    }
    if(e.target.id === "add-group-btn"){
      data.groups.push({id:uid(), name:"Novo grupo", color:"#8b87ff", collapsed:false, tasks:[]});
      save(); renderBoard();
      return;
    }
    var del = e.target.closest('[data-field="delete"]');
    if(del){
      var tr = del.closest("tr");
      var gid2 = tr.getAttribute("data-gid"), tid = tr.getAttribute("data-tid");
      var g3 = data.groups.find(function(g){return g.id===gid2;});
      g3.tasks = g3.tasks.filter(function(t){return t.id!==tid;});
      save(); renderBoard();
      return;
    }
    var ownerToggle = e.target.closest('[data-field="owner-toggle"]');
    if(ownerToggle){
      var tr2 = ownerToggle.closest("tr");
      var t2 = findTask(tr2);
      var name = prompt("Nome do responsável:", t2.owner || "");
      if(name !== null){ t2.owner = name.trim(); save(); renderBoard(); }
      return;
    }
    var filesToggle = e.target.closest('[data-field="files-toggle"]');
    if(filesToggle){
      var tr3 = filesToggle.closest("tr");
      var t3 = findTask(tr3);
      t3.files = !t3.files;
      save(); renderBoard();
      return;
    }
  });

  function findTask(tr){
    var gid = tr.getAttribute("data-gid"), tid = tr.getAttribute("data-tid");
    var g = data.groups.find(function(g){return g.id===gid;});
    return g.tasks.find(function(t){return t.id===tid;});
  }

  boardEl.addEventListener("input", function(e){
    var tr = e.target.closest("tr[data-tid]");
    if(!tr) return;
    var t = findTask(tr);
    var field = e.target.getAttribute("data-field");
    if(field === "name"){ t.name = e.target.value; save(); }
    if(field === "end"){
      t.end = e.target.value;
      t.start = e.target.value;
      save();
      var barCell = tr.querySelector(".timeline-bar, .timeline-bar.empty");
      if(barCell) barCell.outerHTML = statusBarHtml(t);
    }
  });
  boardEl.addEventListener("change", function(e){
    var tr = e.target.closest("tr[data-tid]");
    if(tr && e.target.getAttribute("data-field")==="status"){
      var t = findTask(tr);
      t.status = e.target.value;
      save();
      e.target.className = "pill " + (STATUS[t.status]||STATUS.empty).cls;
      var barCell = tr.querySelector(".timeline-bar, .timeline-bar.empty");
      if(barCell) barCell.outerHTML = statusBarHtml(t);
    }
  });
  boardEl.addEventListener("blur", function(e){
    if(e.target.matches("[data-rename-group]")){
      var gid = e.target.getAttribute("data-rename-group");
      var g = data.groups.find(function(g){return g.id===gid;});
      g.name = e.target.textContent.trim() || "Grupo";
      save();
    }
  }, true);

  document.getElementById("new-task-top").addEventListener("click", function(){
    var g = data.groups[0];
    g.tasks.push({id:uid(), name:"", owner:"", status:"progress", start:todayISO(), end:todayISO(), files:false});
    save(); renderBoard();
    var input = boardEl.querySelector('tr[data-gid="'+g.id+'"]:last-child input.task-name');
    if(input) input.focus();
  });

  document.getElementById("reset-btn").addEventListener("click", function(){
    if(confirm("Restaurar os dados de exemplo? Isso substitui as tarefas atuais.")){
      data = defaultData();
      save(); renderBoard(); renderCalendar();
    }
  });

  // ---- Calendar view ----
  var calDate = new Date();
  calDate.setDate(1);

  function renderCalendar(){
    var year = calDate.getFullYear(), month = calDate.getMonth();
    var monthLabel = calDate.toLocaleDateString("pt-BR", {month:"long", year:"numeric"});

    var firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
    var daysInMonth = new Date(year, month+1, 0).getDate();
    var prevDays = new Date(year, month, 0).getDate();

    var cells = [];
    for(var i=firstDow-1;i>=0;i--){ cells.push({d:prevDays-i, out:true, ym:shiftYM(year,month,-1)}); }
    for(var d=1; d<=daysInMonth; d++){ cells.push({d:d, out:false, ym:[year,month]}); }
    while(cells.length % 7 !== 0 || cells.length < 42){
      var nd = cells.length - (firstDow+daysInMonth) + 1;
      cells.push({d:nd, out:true, ym:shiftYM(year,month,1)});
      if(cells.length>=42) break;
    }

    var tasks = allTasks().filter(function(t){ return t.start && t.end; });
    var todayStr = todayISO();

    var html = '<div class="cal-head">'+
      '<div class="cal-title">'+monthLabel+'</div>'+
      '<div class="cal-nav">'+
        '<button id="cal-today">Hoje</button>'+
        '<button id="cal-prev" aria-label="Mês anterior"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>'+
        '<button id="cal-next" aria-label="Próximo mês"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg></button>'+
      '</div></div>';

    html += '<div class="cal-grid">';
    ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].forEach(function(dn){ html += '<div class="cal-dow">'+dn+'</div>'; });

    cells.forEach(function(c){
      var cy = c.ym[0], cm = c.ym[1];
      var iso = cy+"-"+String(cm+1).padStart(2,"0")+"-"+String(c.d).padStart(2,"0");
      var isToday = iso === todayStr;
      html += '<div class="cal-cell '+(c.out?'out':'')+' '+(isToday?'today':'')+'">';
      html += '<div class="cal-daynum">'+c.d+'</div>';
      tasks.forEach(function(t){
        if(iso >= t.start && iso <= t.end){
          var s = STATUS[t.status] || STATUS.empty;
          html += '<div class="cal-bar" style="background:'+(s.color||'#a6a9c4')+'" title="'+escapeAttr(t.name)+'">'+escapeHtml(t.name||'(sem nome)')+'</div>';
        }
      });
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="legend">'+
      Object.keys(STATUS).filter(function(k){return k!=="empty";}).map(function(k){
        return '<span><i style="background:'+STATUS[k].color+'"></i>'+STATUS[k].label+'</span>';
      }).join('') + '</div>';

    calEl.innerHTML = html;
    document.getElementById("cal-prev").addEventListener("click", function(){ calDate.setMonth(calDate.getMonth()-1); renderCalendar(); });
    document.getElementById("cal-next").addEventListener("click", function(){ calDate.setMonth(calDate.getMonth()+1); renderCalendar(); });
    document.getElementById("cal-today").addEventListener("click", function(){ calDate = new Date(); calDate.setDate(1); renderCalendar(); });
  }

  function shiftYM(y,m,delta){
    var nm = m+delta, ny=y;
    if(nm<0){nm=11; ny--;}
    if(nm>11){nm=0; ny++;}
    return [ny,nm];
  }

  // ---- Tabs ----
  document.querySelectorAll(".tab").forEach(function(tab){
    tab.addEventListener("click", function(){
      document.querySelectorAll(".tab").forEach(function(t){t.classList.remove("active");});
      tab.classList.add("active");
      var view = tab.getAttribute("data-view");
      boardEl.style.display = view==="board" ? "" : "none";
      calEl.style.display = view==="calendar" ? "" : "none";
      if(view==="calendar") renderCalendar();
    });
  });

  renderBoard();
  renderCalendar();

  // Sincroniza com o banco de dados (Vercel Postgres) assim que a página abre.
  // O render acima já mostrou o cache local (ou os dados padrão) instantaneamente;
  // aqui atualizamos com o que está salvo no servidor, se houver.
  fetch("/api/board")
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(remote){
      if(remote && remote.groups){
        data = normalize(remote);
        try{ localStorage.setItem(STORE_KEY, JSON.stringify(data)); }catch(e){}
        renderBoard();
        if(calEl.style.display !== "none") renderCalendar();
      } else if(remote === null){
        // Banco ainda vazio: envia o estado atual como valor inicial.
        queueRemoteSave();
      }
    })
    .catch(function(){ /* API indisponível (ex.: aberto localmente sem Vercel) — segue só com localStorage */ });
})();
