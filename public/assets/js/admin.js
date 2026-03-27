/**
 * FJS Topografia — Admin de Fotos
 * Fluxo focado exclusivamente em gerenciamento de imagens por serviço.
 */
(function () {
  'use strict';

  var pendingDeleteAction = null;
  var serviceImagesMap = {};
  var LAST_SERVICE_KEY = 'fjs_admin_last_service';
  var MAX_FILE_SIZE = 5 * 1024 * 1024;
  var ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
  var SERVICE_LABELS = {
    'levantamento-topografico': 'Levantamento Topográfico',
    'nivelamento': 'Nivelamento',
    'demarcacao': 'Demarcação',
    'locacao-de-obra': 'Locação de Obra',
    'calculo-de-volumetria': 'Cálculo de Volumetria',
    'georreferenciamento': 'Georreferenciamento',
    'analise-por-drone': 'Análise por Drone'
  };

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function sanitize(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function toast(msg, type) {
    type = type || 'success';
    var container = $('#toast-container');
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add('toast-out');
      setTimeout(function () { el.remove(); }, 300);
    }, 3500);
  }

  function openModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  function openDeleteModal(opts) {
    var titleEl = $('#delete-modal-title');
    var textEl = $('#delete-modal-text');
    var confirmBtn = $('#confirm-delete-btn');

    if (titleEl) titleEl.textContent = opts.title || 'Confirmar exclusão';
    if (textEl) textEl.innerHTML = opts.message || 'Tem certeza que deseja excluir este item?';
    if (confirmBtn) {
      confirmBtn.textContent = opts.confirmLabel || 'Excluir';
      confirmBtn.dataset.loadingLabel = opts.loadingLabel || 'Excluindo...';
    }

    pendingDeleteAction = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
    openModal('delete-modal');
  }

  function validateImageFile(file) {
    if (!file) return 'Selecione uma imagem para continuar.';
    if (!ALLOWED_MIMES.includes(file.type)) return 'Formato inválido. Use JPEG, PNG ou WebP.';
    if (file.size > MAX_FILE_SIZE) return 'Arquivo muito grande. Máximo 5MB.';
    return '';
  }

  async function loadServiceImages() {
    try {
      var res = await FjsApi.serviceImages.getAll();
      serviceImagesMap = res.data || {};
      ensureServiceSelection();
      renderServiceImages();
    } catch (err) {
      serviceImagesMap = {};
      renderServiceImages();
      toast('Falha ao carregar fotos: ' + (err.message || 'erro desconhecido'), 'error');
    }
  }

  function ensureServiceSelection() {
    var serviceSelect = $('#service-image-service');
    if (!serviceSelect) return;
    if (serviceSelect.value) return;

    var persisted = localStorage.getItem(LAST_SERVICE_KEY) || '';
    if (persisted === '__all__') {
      serviceSelect.value = '__all__';
      return;
    }
    if (persisted && SERVICE_LABELS[persisted]) {
      serviceSelect.value = persisted;
      return;
    }

    var servicesWithImages = Object.keys(serviceImagesMap).filter(function (key) {
      return Array.isArray(serviceImagesMap[key]) && serviceImagesMap[key].length > 0;
    });
    if (servicesWithImages.length === 1) {
      serviceSelect.value = servicesWithImages[0];
      return;
    }
    serviceSelect.value = '__all__';
  }

  function resolveImageUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//.test(url)) return url;
    var base = FjsApi.getBase();
    if (url.startsWith('/api/')) {
      return base.replace(/\/api\/?$/, '') + url;
    }
    return url;
  }

  function renderServiceImages() {
    var list = $('#service-images-list');
    var serviceSelect = $('#service-image-service');
    if (!list || !serviceSelect) return;

    var service = serviceSelect.value;
    if (!service) {
      var services = Object.keys(serviceImagesMap).filter(function (key) {
        return Array.isArray(serviceImagesMap[key]) && serviceImagesMap[key].length > 0;
      });

      if (!services.length) {
        list.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p>Nenhuma imagem cadastrada ainda.</p></div>';
        return;
      }

      list.innerHTML = '<div class="post-item"><div class="post-info"><h3>Fotos salvas por serviço</h3><p>Selecione um serviço abaixo para editar ou excluir imagens.</p></div><div class="post-actions">' +
        services.map(function (svc) {
          return '<button type="button" class="btn-edit btn-service-quick-select" data-service="' + sanitize(svc) + '">' +
            sanitize((SERVICE_LABELS[svc] || svc) + ' (' + serviceImagesMap[svc].length + ')') +
            '</button>';
        }).join('') +
        '</div></div>';

      list.querySelectorAll('.btn-service-quick-select').forEach(function (btn) {
        btn.addEventListener('click', function () {
          serviceSelect.value = btn.getAttribute('data-service');
          localStorage.setItem(LAST_SERVICE_KEY, serviceSelect.value);
          renderServiceImages();
        });
      });
      return;
    }

    localStorage.setItem(LAST_SERVICE_KEY, service || '__all__');

    var entries = [];
    if (service === '__all__') {
      Object.keys(serviceImagesMap).forEach(function (svcKey) {
        var urls = Array.isArray(serviceImagesMap[svcKey]) ? serviceImagesMap[svcKey] : [];
        urls.forEach(function (url) {
          entries.push({ service: svcKey, url: url });
        });
      });
    } else {
      var scoped = Array.isArray(serviceImagesMap[service]) ? serviceImagesMap[service] : [];
      scoped.forEach(function (url) {
        entries.push({ service: service, url: url });
      });
    }

    if (!entries.length) {
      list.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p>Nenhuma imagem cadastrada neste serviço.</p></div>';
      return;
    }

    list.innerHTML = entries.map(function (entry, index) {
      var cardService = entry.service;
      var url = entry.url;
      var displayUrl = resolveImageUrl(url);
      var encodedUrl = encodeURIComponent(url);
      var encodedService = encodeURIComponent(cardService);
      return '<div class="service-image-card">' +
        '<img src="' + sanitize(displayUrl) + '" alt="Imagem ' + (index + 1) + '">' +
        '<div class="service-image-card__meta"><strong>' + sanitize(SERVICE_LABELS[cardService] || cardService) + '</strong><br>' +
        '<a href="' + sanitize(displayUrl) + '" target="_blank" rel="noopener noreferrer">' + sanitize(url) + '</a></div>' +
        '<div class="service-image-actions">' +
          '<input type="file" class="service-image-edit-input" data-service="' + encodedService + '" data-url="' + encodedUrl + '" accept="image/jpeg,image/png,image/webp" hidden>' +
          '<button type="button" class="btn-edit btn-service-image-edit" data-service="' + encodedService + '" data-url="' + encodedUrl + '">Editar</button>' +
          '<button type="button" class="btn-delete btn-service-image-delete" data-service="' + encodedService + '" data-url="' + encodedUrl + '">Excluir</button>' +
        '</div>' +
        '</div>';
    }).join('');

    bindServiceImageActions(list);
  }

  function bindServiceImageActions(listRoot) {
    listRoot.querySelectorAll('.btn-service-image-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var encodedUrl = btn.getAttribute('data-url');
        var encodedService = btn.getAttribute('data-service');
        var input = listRoot.querySelector('.service-image-edit-input[data-service="' + encodedService + '"][data-url="' + encodedUrl + '"]');
        if (input) input.click();
      });
    });

    listRoot.querySelectorAll('.service-image-edit-input').forEach(function (input) {
      input.addEventListener('change', async function () {
        if (!input.files || !input.files.length) return;
        var file = input.files[0];
        var validationErr = validateImageFile(file);
        if (validationErr) {
          toast(validationErr, 'error');
          input.value = '';
          return;
        }

        var service = decodeURIComponent(input.getAttribute('data-service') || '');
        var currentUrl = decodeURIComponent(input.getAttribute('data-url') || '');
        var fd = new FormData();
        fd.append('service', service);
        fd.append('currentUrl', currentUrl);
        fd.append('image', file);

        try {
          await FjsApi.serviceImages.update(fd);
          toast('Imagem atualizada com sucesso');
          await loadServiceImages();
        } catch (err) {
          toast('Erro ao atualizar imagem: ' + err.message, 'error');
        } finally {
          input.value = '';
        }
      });
    });

    listRoot.querySelectorAll('.btn-service-image-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var service = decodeURIComponent(btn.getAttribute('data-service') || '');
        var imageUrl = decodeURIComponent(btn.getAttribute('data-url') || '');
        if (!imageUrl || !service) return;
        openDeleteModal({
          title: 'Excluir Imagem',
          message: 'Tem certeza que deseja <strong>excluir esta imagem do serviço</strong>?',
          confirmLabel: 'Excluir imagem',
          loadingLabel: 'Excluindo imagem...',
          onConfirm: async function () {
            await FjsApi.serviceImages.remove({ service: service, imageUrl: imageUrl });
            toast('Imagem excluída com sucesso');
            await loadServiceImages();
          }
        });
      });
    });
  }

  async function addServiceImage() {
    var serviceSelect = $('#service-image-service');
    var fileInput = $('#service-image-upload');
    var addBtn = $('#add-service-image-btn');
    if (!serviceSelect || !fileInput || !addBtn) return;

    var service = serviceSelect.value;
    var file = fileInput.files && fileInput.files[0];

    if (!service || service === '__all__') {
      toast('Selecione um serviço antes de adicionar a foto.', 'error');
      return;
    }

    var validationErr = validateImageFile(file);
    if (validationErr) {
      toast(validationErr, 'error');
      return;
    }

    var originalLabel = addBtn.innerHTML;
    addBtn.disabled = true;
    addBtn.textContent = 'Enviando...';

    try {
      var fd = new FormData();
      fd.append('service', service);
      fd.append('image', file);
      await FjsApi.serviceImages.add(fd);
      serviceSelect.value = service;
      localStorage.setItem(LAST_SERVICE_KEY, service);
      fileInput.value = '';
      toast('Imagem adicionada com sucesso');
      await loadServiceImages();
    } catch (err) {
      toast('Erro ao adicionar imagem: ' + err.message, 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.innerHTML = originalLabel;
    }
  }

  function initSidebar() {
    var sidebar = $('#sidebar');
    var sidebarToggle = $('#sidebar-toggle');
    var sidebarOverlay = $('#sidebar-overlay');

    function openSidebar() {
      if (sidebar) sidebar.classList.add('open');
      if (sidebarOverlay) sidebarOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', function () {
        if (sidebar && sidebar.classList.contains('open')) closeSidebar();
        else openSidebar();
      });
    }

    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    $$('.nav-btn[data-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        closeSidebar();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        $$('.modal.active').forEach(function (m) { m.classList.remove('active'); });
        closeSidebar();
      }
    });
  }

  function initModalCloseHandlers() {
    $$('.close-modal, .close-modal-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var modal = e.target.closest('.modal');
        if (modal) modal.classList.remove('active');
      });
    });

    $$('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.classList.remove('active');
      });
    });

    var confirmDeleteBtn = $('#confirm-delete-btn');
    if (!confirmDeleteBtn) return;

    confirmDeleteBtn.addEventListener('click', async function () {
      if (!pendingDeleteAction) return;
      confirmDeleteBtn.disabled = true;
      var originalLabel = confirmDeleteBtn.textContent;
      confirmDeleteBtn.textContent = confirmDeleteBtn.dataset.loadingLabel || 'Excluindo...';
      try {
        await pendingDeleteAction();
        closeModal('delete-modal');
      } catch (err) {
        toast('Erro: ' + err.message, 'error');
      } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = originalLabel;
        pendingDeleteAction = null;
      }
    });
  }

  function showLogin() {
    $('#login-screen').style.display = 'flex';
    $('#admin-dashboard').style.display = 'none';
  }

  function showDashboard() {
    $('#login-screen').style.display = 'none';
    $('#admin-dashboard').style.display = 'flex';
    var onlyNav = $('.nav-btn[data-section="service-images"]');
    if (onlyNav) onlyNav.classList.add('active');
  }

  async function checkSession() {
    try {
      var res = await FjsApi.auth.refresh();
      if (res.data && res.data.accessToken) {
        FjsApi.setToken(res.data.accessToken);
        showDashboard();
        loadServiceImages();
        return;
      }
    } catch (_err) {
      // sessão ausente/expirada
    }
    showLogin();
  }

  function initAuth() {
    var loginForm = $('#login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var errorEl = $('#login-error');
        errorEl.textContent = '';
        var email = $('#login-email').value.trim();
        var password = $('#login-password').value;
        if (!email || !password) {
          errorEl.textContent = 'Preencha todos os campos.';
          return;
        }
        try {
          var res = await FjsApi.auth.login(email, password);
          FjsApi.setToken(res.data.accessToken);
          showDashboard();
          await loadServiceImages();
          toast('Login realizado com sucesso');
        } catch (err) {
          errorEl.textContent = err.message || 'Erro ao fazer login';
        }
      });
    }

    var logoutBtn = $('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        try { await FjsApi.auth.logout(); } catch (_err) { /* ignore */ }
        FjsApi.clearToken();
        showLogin();
        toast('Sessão encerrada');
      });
    }
  }

  function connectSSE() {
    try {
      var es = new EventSource(FjsApi.buildUrl('/events'), { withCredentials: true });
      es.addEventListener('service:images:updated', function () { loadServiceImages(); });
      es.onerror = function () {
        es.close();
        setTimeout(connectSSE, 5000);
      };
    } catch (_err) {
      // ignore
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initSidebar();
    initModalCloseHandlers();
    initAuth();
    checkSession();
    connectSSE();

    var serviceSelect = $('#service-image-service');
    if (serviceSelect) {
      if (!serviceSelect.value) serviceSelect.value = '__all__';
      serviceSelect.addEventListener('change', function () {
        localStorage.setItem(LAST_SERVICE_KEY, serviceSelect.value || '');
        renderServiceImages();
      });
    }

    var addBtn = $('#add-service-image-btn');
    if (addBtn) addBtn.addEventListener('click', addServiceImage);
  });
})();
