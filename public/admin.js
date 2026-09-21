(function () {
  'use strict';

  var loginView = document.getElementById('login-view');
  var panelView = document.getElementById('panel-view');
  var loginForm = document.getElementById('login-form');
  var loginMessage = document.getElementById('login-message');
  var adminMessage = document.getElementById('admin-message');
  var listEl = document.getElementById('admin-list');
  var listStatus = document.getElementById('list-status');
  var pieceForm = document.getElementById('piece-form');
  var formHeading = document.getElementById('form-heading');
  var saveBtn = document.getElementById('save-btn');
  var cancelEditBtn = document.getElementById('cancel-edit');
  var removeImageRow = document.getElementById('remove-image-row');
  var currentImageNote = document.getElementById('current-image-note');

  var editingId = null;

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showAdminMessage(text, kind) {
    adminMessage.textContent = text;
    adminMessage.className = 'admin-message admin-message--' + kind;
    if (kind === 'success') {
      setTimeout(function () {
        adminMessage.className = 'admin-message';
      }, 4000);
    }
  }

  // --- Session / auth ----------------------------------------------------

  function checkSession() {
    fetch('/api/admin/session')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.authenticated) {
          showPanel();
        } else {
          showLogin();
        }
      })
      .catch(showLogin);
  }

  function showLogin() {
    loginView.hidden = false;
    panelView.hidden = true;
    var pw = document.getElementById('login-password');
    if (pw) pw.focus();
  }

  function showPanel() {
    loginView.hidden = true;
    panelView.hidden = false;
    loadPieces();
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    loginMessage.className = 'form-message';
    var password = document.getElementById('login-password').value;

    fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (res.ok) {
          showPanel();
        } else {
          loginMessage.textContent = (res.body && res.body.error) || 'Login failed.';
          loginMessage.className = 'form-message form-message--error';
        }
      })
      .catch(function () {
        loginMessage.textContent = 'Could not reach the server. Please try again.';
        loginMessage.className = 'form-message form-message--error';
      });
  });

  document.getElementById('logout-btn').addEventListener('click', function () {
    fetch('/admin/logout', { method: 'POST' }).finally(function () {
      resetForm();
      showLogin();
    });
  });

  // --- Load & render pieces ---------------------------------------------

  function loadPieces() {
    listStatus.textContent = 'Loading…';
    fetch('/api/admin/pieces')
      .then(function (r) {
        if (r.status === 401) {
          showLogin();
          throw new Error('unauthorized');
        }
        return r.json();
      })
      .then(function (pieces) {
        renderList(pieces);
      })
      .catch(function (err) {
        if (err.message !== 'unauthorized') {
          listStatus.textContent = 'Could not load pieces.';
        }
      });
  }

  function renderList(pieces) {
    listEl.innerHTML = '';
    if (!pieces.length) {
      listStatus.textContent = 'No pieces yet. Add your first one above!';
      return;
    }
    listStatus.textContent = '';

    pieces.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'admin-item';

      var thumb = p.image
        ? '<img class="admin-item__thumb" src="' +
          escapeHtml(p.image) +
          '" alt="' +
          escapeHtml(p.title) +
          '" />'
        : '<div class="admin-item__thumb admin-item__thumb--empty">No photo</div>';

      var tag =
        '<span class="tag tag--' +
        (p.status === 'sold' ? 'sold' : 'available') +
        '">' +
        (p.status === 'sold' ? 'Sold' : 'Available') +
        '</span>';

      li.innerHTML =
        thumb +
        '<div>' +
        '<p class="admin-item__title">' +
        escapeHtml(p.title) +
        '</p>' +
        '<p class="admin-item__meta">' +
        (p.price ? escapeHtml(p.price) + ' · ' : '') +
        tag +
        '</p>' +
        (p.description
          ? '<p class="admin-item__meta">' + escapeHtml(p.description) + '</p>'
          : '') +
        '</div>' +
        '<div class="admin-item__actions">' +
        '<button type="button" class="btn btn--ghost" data-edit="' +
        p.id +
        '">Edit</button>' +
        '<button type="button" class="btn btn--danger" data-delete="' +
        p.id +
        '">Delete</button>' +
        '</div>';

      // Stash data for editing without another round-trip.
      li._piece = p;
      listEl.appendChild(li);
    });
  }

  listEl.addEventListener('click', function (e) {
    var editBtn = e.target.closest('[data-edit]');
    var delBtn = e.target.closest('[data-delete]');
    if (editBtn) {
      var li = editBtn.closest('.admin-item');
      startEdit(li._piece);
    } else if (delBtn) {
      deletePiece(delBtn.getAttribute('data-delete'));
    }
  });

  // --- Add / edit --------------------------------------------------------

  function resetForm() {
    editingId = null;
    pieceForm.reset();
    document.getElementById('piece-id').value = '';
    formHeading.textContent = 'Add a piece';
    saveBtn.textContent = 'Add piece';
    cancelEditBtn.hidden = true;
    removeImageRow.hidden = true;
    document.getElementById('f-remove-image').checked = false;
    currentImageNote.textContent = '';
  }

  function startEdit(p) {
    editingId = p.id;
    document.getElementById('piece-id').value = p.id;
    document.getElementById('f-title').value = p.title || '';
    document.getElementById('f-description').value = p.description || '';
    document.getElementById('f-price').value = p.price || '';
    document.getElementById('f-status').value = p.status === 'sold' ? 'sold' : 'available';
    document.getElementById('f-image').value = '';
    document.getElementById('f-remove-image').checked = false;

    formHeading.textContent = 'Edit piece';
    saveBtn.textContent = 'Save changes';
    cancelEditBtn.hidden = false;

    if (p.image) {
      removeImageRow.hidden = false;
      currentImageNote.textContent = 'A photo is set. Choose a new file to replace it.';
    } else {
      removeImageRow.hidden = true;
      currentImageNote.textContent = 'No photo yet.';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEditBtn.addEventListener('click', resetForm);

  pieceForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var title = document.getElementById('f-title').value.trim();
    if (!title) {
      showAdminMessage('Please enter a title.', 'error');
      return;
    }

    var fd = new FormData();
    fd.append('title', title);
    fd.append('description', document.getElementById('f-description').value);
    fd.append('price', document.getElementById('f-price').value);
    fd.append('status', document.getElementById('f-status').value);

    var fileInput = document.getElementById('f-image');
    if (fileInput.files && fileInput.files[0]) {
      fd.append('image', fileInput.files[0]);
    }
    if (editingId && document.getElementById('f-remove-image').checked) {
      fd.append('remove_image', 'true');
    }

    saveBtn.disabled = true;
    var url = editingId ? '/api/admin/pieces/' + editingId : '/api/admin/pieces';
    var method = editingId ? 'PATCH' : 'POST';

    fetch(url, { method: method, body: fd })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, status: r.status, body: body };
        });
      })
      .then(function (res) {
        if (res.status === 401) {
          showLogin();
          return;
        }
        if (res.ok) {
          showAdminMessage(
            editingId ? 'Piece updated.' : 'Piece added.',
            'success'
          );
          resetForm();
          loadPieces();
        } else {
          showAdminMessage((res.body && res.body.error) || 'Could not save.', 'error');
        }
      })
      .catch(function () {
        showAdminMessage('Could not save. Please try again.', 'error');
      })
      .finally(function () {
        saveBtn.disabled = false;
      });
  });

  function deletePiece(id) {
    if (!window.confirm('Delete this piece? This cannot be undone.')) return;
    fetch('/api/admin/pieces/' + id, { method: 'DELETE' })
      .then(function (r) {
        if (r.status === 401) {
          showLogin();
          return;
        }
        if (r.ok) {
          showAdminMessage('Piece deleted.', 'success');
          if (editingId === Number(id)) resetForm();
          loadPieces();
        } else {
          showAdminMessage('Could not delete the piece.', 'error');
        }
      })
      .catch(function () {
        showAdminMessage('Could not delete the piece.', 'error');
      });
  }

  checkSession();
})();
