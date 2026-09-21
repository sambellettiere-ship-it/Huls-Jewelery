(function () {
  'use strict';

  var grid = document.getElementById('gallery-grid');
  var statusEl = document.getElementById('gallery-status');

  document.getElementById('year').textContent = new Date().getFullYear();

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderPieces(pieces) {
    grid.innerHTML = '';

    if (!pieces.length) {
      statusEl.style.display = 'none';
      var empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent =
        'No pieces are listed right now — check back soon, or send a message below!';
      grid.appendChild(empty);
      return;
    }

    statusEl.style.display = 'none';

    pieces.forEach(function (p) {
      var card = document.createElement('article');
      card.className = 'card';

      var media = p.image
        ? '<div class="card__media">' +
          (p.status === 'sold' ? '<span class="card__badge">Sold</span>' : '') +
          '<img src="' +
          escapeHtml(p.image) +
          '" alt="' +
          escapeHtml(p.title) +
          '" loading="lazy" /></div>'
        : '<div class="card__media card__media--empty">' +
          (p.status === 'sold' ? '<span class="card__badge">Sold</span>' : '') +
          'No photo yet</div>';

      var price = p.price
        ? '<p class="card__price">' + escapeHtml(p.price) + '</p>'
        : '';
      var desc = p.description
        ? '<p class="card__desc">' + escapeHtml(p.description) + '</p>'
        : '';

      card.innerHTML =
        media +
        '<div class="card__body">' +
        '<h3 class="card__title">' +
        escapeHtml(p.title) +
        '</h3>' +
        price +
        desc +
        '<div class="card__foot">' +
        '<button type="button" class="btn btn--ghost" data-inquire="' +
        escapeHtml(p.title) +
        '">Inquire</button>' +
        '</div>' +
        '</div>';

      grid.appendChild(card);
    });
  }

  function loadPieces() {
    fetch('/api/pieces')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load pieces');
        return res.json();
      })
      .then(renderPieces)
      .catch(function () {
        statusEl.textContent =
          'Sorry — the pieces could not be loaded right now. Please try again later.';
      });
  }

  // "Inquire" buttons pre-fill the contact form with the piece title.
  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-inquire]');
    if (!btn) return;
    var pieceField = document.getElementById('piece-field');
    if (pieceField) pieceField.value = btn.getAttribute('data-inquire');
    var contact = document.getElementById('contact');
    if (contact) contact.scrollIntoView({ behavior: 'smooth' });
    var nameInput = document.querySelector('.contact-form input[name="name"]');
    if (nameInput) setTimeout(function () { nameInput.focus(); }, 400);
  });

  // --- Contact form (Formspree) -----------------------------------------

  var form = document.getElementById('contact-form');
  var formMessage = document.getElementById('form-message');
  var submitBtn = document.getElementById('contact-submit');

  var formspreeId =
    (window.APP_CONFIG && window.APP_CONFIG.formspreeFormId) || '';

  function showFormMessage(text, kind) {
    formMessage.textContent = text;
    formMessage.className = 'form-message form-message--' + kind;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (!formspreeId) {
      showFormMessage(
        'The contact form is not configured yet. Please call 217-480-7083 or email Debbiehuls@aol.com.',
        'error'
      );
      return;
    }

    submitBtn.disabled = true;
    var originalText = submitBtn.textContent;
    submitBtn.textContent = 'Sending…';

    var data = new FormData(form);

    fetch('https://formspree.io/f/' + formspreeId, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          showFormMessage(
            'Thank you! Your message has been sent — Debbie will get back to you soon.',
            'success'
          );
        } else {
          return res.json().then(function (body) {
            var msg =
              body && body.errors && body.errors.length
                ? body.errors.map(function (er) { return er.message; }).join(', ')
                : 'Something went wrong sending your message.';
            showFormMessage(msg, 'error');
          });
        }
      })
      .catch(function () {
        showFormMessage(
          'Could not send your message. Please call 217-480-7083 or email Debbiehuls@aol.com.',
          'error'
        );
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
  });

  loadPieces();
})();
