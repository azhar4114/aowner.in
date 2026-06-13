(function() {
  var config = window.AGLAOWNER_CONFIG || {};
  var demoListings = window.AGLAOWNER_DEMO_LISTINGS || [];
  var dateFormatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium"
  });
  var sellerOwnerRoles = [
    "Owner",
    "Co-owner",
    "Authorized decision maker"
  ];
  var sellerStepFields = {
    1: ["ownerRole", "businessName", "sellerName", "sellerEmail", "sellerMobile", "sellerWhatsapp"],
    2: [
      "category",
      "city",
      "locality",
      "askingPriceBand",
      "monthlyRevenueBand",
      "monthlyProfitBand",
      "monthlyRentBand",
      "yearsRunning",
      "teamSizeBand"
    ],
    3: [
      "reasonForSale",
      "assetsIncluded",
      "businessSummary",
      "websiteUrl",
      "instagramUrl",
      "googleMapsUrl",
      "proofPhotoUrl",
      "consentAccepted"
    ]
  };

  function apiConfigured() {
    return Boolean(config.apiBaseUrl && !/REPLACE/i.test(config.apiBaseUrl));
  }

  function apiBaseUrl() {
    return String(config.apiBaseUrl || "").replace(/\/+$/, "");
  }

  function buildApiUrl(route, params) {
    var base = apiBaseUrl();
    var merged = Object.assign({}, params || {});
    var normalizedRoute = String(route || "").replace(/^\/+|\/+$/g, "");
    if (normalizedRoute) {
      merged.route = normalizedRoute;
    }
    var pairs = [];
    Object.keys(merged).forEach(function(key) {
      if (merged[key] !== undefined && merged[key] !== null && merged[key] !== "") {
        pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(merged[key])));
      }
    });
    return pairs.length ? base + "?" + pairs.join("&") : base;
  }

  function createJsonpRequest(route, params) {
    return new Promise(function(resolve, reject) {
      var callbackName = "__aglaowner_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      var script = document.createElement("script");
      var cleaned = false;

      function cleanup() {
        if (cleaned) {
          return;
        }
        cleaned = true;
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function(payload) {
        cleanup();
        resolve(payload);
      };

      script.onerror = function() {
        cleanup();
        reject(new Error("Failed to load API response."));
      };

      script.src = buildApiUrl(route, Object.assign({}, params, { callback: callbackName }));
      document.body.appendChild(script);
    });
  }

  function postViaIframe(route, payload) {
    if (!apiConfigured()) {
      return Promise.resolve({
        ok: true,
        message: route === "interest"
          ? "Demo mode: enquiry accepted locally. Configure the API URL to enable seller emails."
          : "Demo mode: owner action accepted locally."
      });
    }

    return new Promise(function(resolve, reject) {
      var requestId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      var iframe = document.createElement("iframe");
      var form = document.createElement("form");
      var cleaned = false;

      function cleanup() {
        if (cleaned) {
          return;
        }
        cleaned = true;
        window.removeEventListener("message", onMessage);
        setTimeout(function() {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
          if (form.parentNode) {
            form.parentNode.removeChild(form);
          }
        }, 50);
      }

      function onMessage(event) {
        var data = event.data;
        if (!data || data.requestId !== requestId) {
          return;
        }
        cleanup();
        if (data.ok) {
          resolve(data);
          return;
        }
        reject(new Error(data.error || "Request failed."));
      }

      window.addEventListener("message", onMessage);

      iframe.name = requestId;
      iframe.style.display = "none";
      document.body.appendChild(iframe);

      form.method = "POST";
      form.target = requestId;
      form.action = apiBaseUrl();
      form.style.display = "none";

      var merged = Object.assign({}, payload, {
        route: route,
        requestId: requestId,
        transport: "iframe"
      });

      Object.keys(merged).forEach(function(key) {
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = merged[key];
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();

      window.setTimeout(function() {
        cleanup();
        reject(new Error("Request timed out."));
      }, 20000);
    });
  }

  function getDemoListingsResponse(filters) {
    var city = normalizeKey(filters.city || "");
    var category = normalizeKey(filters.category || "");
    var page = Math.max(parseInt(filters.page || "1", 10), 1);
    var filtered = demoListings.filter(function(item) {
      return (!city || normalizeKey(item.city) === city) && (!category || normalizeKey(item.category) === category);
    });
    return Promise.resolve({
      ok: true,
      page: page,
      pageSize: 20,
      total: filtered.length,
      totalPages: Math.max(Math.ceil(filtered.length / 20), 1),
      filters: {
        cities: uniqueValues(filtered.map(function(item) { return item.city; })),
        categories: uniqueValues(filtered.map(function(item) { return item.category; }))
      },
      items: filtered.slice((page - 1) * 20, page * 20)
    });
  }

  function getListings(params) {
    if (!apiConfigured() && config.useDemoDataWhenApiMissing) {
      return getDemoListingsResponse(params || {});
    }
    return createJsonpRequest("listings", params || {});
  }

  function getListing(listingId) {
    if (!apiConfigured() && config.useDemoDataWhenApiMissing) {
      var item = demoListings.find(function(entry) {
        return entry.listingId === listingId;
      });
      return Promise.resolve(item ? { ok: true, item: item } : { ok: false, error: "Listing not found." });
    }
    return createJsonpRequest("listing", { id: listingId });
  }

  function getOwnerView(listingId, token) {
    if (!apiConfigured() && config.useDemoDataWhenApiMissing) {
      var item = demoListings.find(function(entry) {
        return entry.listingId === listingId;
      });
      return Promise.resolve(item ? { ok: true, listing: item, leads: [] } : { ok: false, error: "Listing not found." });
    }
    return createJsonpRequest("owner-view", { id: listingId, token: token });
  }

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function uniqueValues(values) {
    var seen = {};
    values.forEach(function(value) {
      if (value) {
        seen[value] = true;
      }
    });
    return Object.keys(seen).sort();
  }

  function formatDate(isoDate) {
    if (!isoDate) {
      return "Not specified";
    }
    return dateFormatter.format(new Date(isoDate));
  }

  function query() {
    return new URLSearchParams(window.location.search);
  }

  function updateQuery(params) {
    var next = new URLSearchParams(window.location.search);
    Object.keys(params).forEach(function(key) {
      if (params[key]) {
        next.set(key, params[key]);
      } else {
        next.delete(key);
      }
    });
    var nextUrl = window.location.pathname + (next.toString() ? "?" + next.toString() : "");
    window.history.replaceState({}, "", nextUrl);
  }

  function listingHref(listing) {
    return "listing.html?id=" + encodeURIComponent(listing.listingId);
  }

  function sellerEntryHref() {
    return "index.html#list-business";
  }

  function sellerFormDirectHref() {
    return config.googleFormUrl || "";
  }

  function sellerFormResponseHref() {
    if (config.sellerFormResponseUrl) {
      return config.sellerFormResponseUrl;
    }
    var directUrl = sellerFormDirectHref();
    if (!directUrl) {
      return "";
    }
    return directUrl.replace(/\/viewform(?:\?.*)?$/, "/formResponse");
  }

  function sellerFormEntries() {
    return config.sellerFormEntries || {};
  }

  function sellerFormConfigured() {
    var entries = sellerFormEntries();
    var required = [
      "ownerRole",
      "businessName",
      "sellerName",
      "sellerEmail",
      "sellerMobile",
      "sellerWhatsapp",
      "category",
      "city",
      "locality",
      "askingPriceBand",
      "monthlyRevenueBand",
      "monthlyProfitBand",
      "monthlyRentBand",
      "yearsRunning",
      "teamSizeBand",
      "reasonForSale",
      "assetsIncluded",
      "businessSummary",
      "consentAccepted"
    ];
    return Boolean(sellerFormResponseHref()) && required.every(function(name) {
      return Boolean(entries[name]);
    });
  }

  function showBanner(message, type) {
    var banner = document.querySelector("[data-banner]");
    if (!banner) {
      return;
    }
    banner.textContent = message;
    banner.className =
      "rounded-2xl px-4 py-3 text-sm font-medium " +
      (type === "error"
        ? "bg-red-50 text-red-700 ring-1 ring-red-100"
        : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100");
    banner.hidden = false;
  }

  function hideBanner() {
    var banner = document.querySelector("[data-banner]");
    if (banner) {
      banner.hidden = true;
    }
  }

  function createListingCard(listing) {
    var proof = (listing.proofSignals || []).slice(0, 3).map(function(signal) {
      return '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">' + escapeHtml(signal) + "</span>";
    }).join("");
    return [
      '<article class="panel-ring shadow-panel rounded-3xl bg-white p-6">',
      '<div class="flex items-start justify-between gap-4">',
      '<div>',
      '<p class="text-xs font-semibold uppercase tracking-wide text-orange-600">' + escapeHtml(listing.category) + "</p>",
      '<h3 class="mt-2 text-xl font-semibold text-slate-900">' + escapeHtml(listing.title) + "</h3>",
      '<p class="mt-2 text-sm text-slate-500">' + escapeHtml(listing.locality || listing.city) + ", " + escapeHtml(listing.city) + "</p>",
      "</div>",
      '<span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">' + escapeHtml(listing.reviewBadge || "Reviewed") + "</span>",
      "</div>",
      '<p class="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">' + escapeHtml(listing.summary) + "</p>",
      '<dl class="mt-5 grid grid-cols-2 gap-3 text-sm">',
      infoTile("Asking", listing.askingPriceBand),
      infoTile("Revenue", listing.revenueBand || listing.monthlyRevenueBand),
      infoTile("Profit", listing.profitBand || listing.monthlyProfitBand),
      infoTile("Years", listing.yearsRunning),
      "</dl>",
      '<div class="mt-5 flex flex-wrap gap-2">' + proof + "</div>",
      '<div class="mt-6 flex items-center justify-between gap-4">',
      '<p class="text-xs text-slate-500">Live till ' + escapeHtml(formatDate(listing.expiresAt)) + "</p>",
      '<a href="' + listingHref(listing) + '" class="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">View details</a>',
      "</div>",
      "</article>"
    ].join("");
  }

  function infoTile(label, value) {
    return [
      '<div class="rounded-2xl bg-slate-50 px-3 py-3">',
      '<dt class="text-xs font-medium uppercase tracking-wide text-slate-500">' + escapeHtml(label) + "</dt>",
      '<dd class="mt-1 text-sm font-semibold text-slate-900">' + escapeHtml(value || "Not shared") + "</dd>",
      "</div>"
    ].join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fillStaticLinks() {
    document.querySelectorAll("[data-seller-form-link]").forEach(function(link) {
      link.setAttribute("href", sellerEntryHref());
    });
    document.querySelectorAll("[data-google-form-direct-link]").forEach(function(link) {
      link.setAttribute("href", sellerFormDirectHref() || sellerEntryHref());
    });
    document.querySelectorAll("[data-grievance-email]").forEach(function(node) {
      node.textContent = config.grievanceEmail;
      if (node.tagName === "A") {
        node.href = "mailto:" + config.grievanceEmail;
      }
    });
    document.querySelectorAll("[data-support-email]").forEach(function(node) {
      node.textContent = config.supportEmail;
      if (node.tagName === "A") {
        node.href = "mailto:" + config.supportEmail;
      }
    });
    var yearNode = document.querySelector("[data-year]");
    if (yearNode) {
      yearNode.textContent = String(new Date().getFullYear());
    }
  }

  function loadingStateHtml(message) {
    return [
      '<div class="lg:col-span-2 panel-ring rounded-3xl bg-white p-10 text-center shadow-panel">',
      '<p class="text-sm font-semibold uppercase tracking-wide text-orange-700">Loading</p>',
      '<p class="mt-3 text-base text-slate-600">' + escapeHtml(message || "Loading listings...") + "</p>",
      "</div>"
    ].join("");
  }

  function initHomeSellerForm() {
    var form = document.querySelector("[data-seller-native-form]");
    if (!form) {
      return;
    }

    var sellerSection = document.getElementById("list-business");
    hideBanner();
    var configNote = document.querySelector("[data-seller-form-config-note]");
    var progressFill = sellerSection ? sellerSection.querySelector("[data-seller-progress-fill]") : null;
    var proofError = form.querySelector("[data-proof-error]");
    var currentStep = 1;

    if (!sellerFormConfigured()) {
      if (configNote) {
        configNote.hidden = false;
      }
      showBanner("Seller form is not fully configured yet. Use the direct Google Form until assets/config.js is updated.", "error");
      form.querySelectorAll("button").forEach(function(button) {
        if (button.type === "submit") {
          button.disabled = true;
        }
      });
    } else if (configNote) {
      configNote.hidden = true;
    }

    function getFieldErrorNode(name) {
      return form.querySelector('[data-field-error-for="' + name + '"]');
    }

    function clearFieldError(field) {
      if (!field) {
        return;
      }
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
      var errorNode = getFieldErrorNode(field.name);
      if (errorNode) {
        errorNode.textContent = "";
        errorNode.hidden = true;
      }
    }

    function setFieldError(field, message) {
      clearFieldError(field);
      field.setCustomValidity(message);
      field.setAttribute("aria-invalid", "true");
      var errorNode = getFieldErrorNode(field.name);
      if (errorNode) {
        errorNode.textContent = message;
        errorNode.hidden = false;
      }
      if (typeof field.focus === "function") {
        field.focus();
      }
      return false;
    }

    function clearProofError() {
      if (!proofError) {
        return;
      }
      proofError.textContent = "";
      proofError.hidden = true;
    }

    function setProofError(message) {
      if (!proofError) {
        showBanner(message, "error");
        return false;
      }
      proofError.textContent = message;
      proofError.hidden = false;
      return false;
    }

    function syncCounter(name) {
      var counter = form.querySelector('[data-char-counter="' + name + '"]');
      if (!counter) {
        return;
      }
      var minimum = name === "businessSummary" ? 150 : 25;
      var count = getSellerFieldValue(name).length;
      counter.textContent = count + " / " + minimum + " minimum";
      counter.style.color = count >= minimum ? "#059669" : "#64748b";
    }

    function updateSellerStep(step) {
      currentStep = step;
      form.querySelectorAll("[data-seller-step-panel]").forEach(function(panel) {
        panel.hidden = Number(panel.getAttribute("data-seller-step-panel")) !== step;
      });
      if (progressFill) {
        progressFill.style.width = (step / 3 * 100) + "%";
      }
      sellerSection.querySelectorAll("[data-seller-step-chip]").forEach(function(chip) {
        var chipStep = Number(chip.getAttribute("data-seller-step-chip"));
        chip.classList.toggle("is-active", chipStep === step);
        chip.classList.toggle("is-complete", chipStep < step);
      });
    }

    function getSellerFieldValue(name) {
      var field = form.elements[name];
      if (!field) {
        return "";
      }
      if (field.type === "checkbox") {
        return field.checked ? String(field.value || "Yes") : "";
      }
      return String(field.value || "").trim();
    }

    function reportFieldError(field, message) {
      return setFieldError(field, message);
    }

    function validateSellerField(name) {
      var field = form.elements[name];
      if (!field) {
        return true;
      }
      clearFieldError(field);
      var value = getSellerFieldValue(name);

      if (field.required && !value) {
        return reportFieldError(field, name === "consentAccepted" ? "Consent is required." : "This field is required.");
      }

      if (!value) {
        return true;
      }

      if (name === "ownerRole" && sellerOwnerRoles.indexOf(value) === -1) {
        return reportFieldError(field, "Select a valid owner role.");
      }

      if (name === "sellerEmail" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return reportFieldError(field, "Enter a valid email address.");
      }

      if ((name === "sellerMobile" || name === "sellerWhatsapp") && !/^(?:\+91\s?)?[6-9]\d{9}$/.test(value)) {
        return reportFieldError(field, "Enter a valid Indian mobile number.");
      }

      if (name === "reasonForSale" && value.length < 25) {
        return reportFieldError(field, "Enter at least 25 characters.");
      }

      if (name === "businessSummary" && value.length < 150) {
        return reportFieldError(field, "Enter at least 150 characters.");
      }

      if (field.type === "url") {
        try {
          new URL(value);
        } catch (error) {
          return reportFieldError(field, "Enter a valid URL.");
        }
      }

      return true;
    }

    function validateSellerProofGroup() {
      clearProofError();
      var hasProof = Boolean(
        getSellerFieldValue("websiteUrl") ||
        getSellerFieldValue("instagramUrl") ||
        getSellerFieldValue("googleMapsUrl")
      );
      if (hasProof) {
        return true;
      }
      setProofError("Add at least one public proof link: Website, Instagram, or Google Maps.");
      var fallbackField = form.elements.googleMapsUrl || form.elements.instagramUrl || form.elements.websiteUrl;
      if (fallbackField) {
        fallbackField.focus();
      }
      return false;
    }

    function validateSellerStep(step) {
      hideBanner();
      var fields = sellerStepFields[step] || [];
      for (var index = 0; index < fields.length; index += 1) {
        if (!validateSellerField(fields[index])) {
          return false;
        }
      }
      if (step === 3 && !validateSellerProofGroup()) {
        return false;
      }
      return true;
    }

    function buildSellerSubmissionParams() {
      var params = new URLSearchParams();
      var entries = sellerFormEntries();
      Object.keys(entries).forEach(function(name) {
        var value = getSellerFieldValue(name);
        if (value) {
          params.append(entries[name], value);
        }
      });
      return params;
    }

    form.querySelectorAll("[data-seller-next]").forEach(function(button) {
      button.addEventListener("click", function() {
        if (!validateSellerStep(currentStep)) {
          return;
        }
        updateSellerStep(Math.min(currentStep + 1, 3));
      });
    });

    form.querySelectorAll("[data-seller-back]").forEach(function(button) {
      button.addEventListener("click", function() {
        hideBanner();
        updateSellerStep(Math.max(currentStep - 1, 1));
      });
    });

    form.querySelectorAll("input, select, textarea").forEach(function(field) {
      var eventName = field.tagName === "SELECT" || field.type === "checkbox" ? "change" : "input";
      field.addEventListener(eventName, function() {
        clearFieldError(field);
        if (field.name === "websiteUrl" || field.name === "instagramUrl" || field.name === "googleMapsUrl") {
          clearProofError();
        }
        syncCounter(field.name);
      });
      field.addEventListener("blur", function() {
        syncCounter(field.name);
      });
    });

    form.addEventListener("submit", function(event) {
      event.preventDefault();
      if (!sellerFormConfigured()) {
        showBanner("Seller form is not configured. Use the direct Google Form link for now.", "error");
        return;
      }
      if (!validateSellerStep(3)) {
        return;
      }

      var submitButton = form.querySelector("[data-seller-submit]");
      var originalText = submitButton ? submitButton.textContent : "";
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
      }

      fetch(sellerFormResponseHref(), {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: buildSellerSubmissionParams().toString()
      }).then(function() {
        form.reset();
        clearProofError();
        updateSellerStep(1);
        form.querySelectorAll("input, select, textarea").forEach(function(field) {
          clearFieldError(field);
          syncCounter(field.name);
        });
        showBanner("Listing submitted. We usually review within 48 hours and may call or WhatsApp to confirm owner intent.", "success");
        var section = document.getElementById("list-business");
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }).catch(function() {
        showBanner("We could not submit the listing right now. Please try again in a moment or use the direct Google Form link.", "error");
      }).finally(function() {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalText;
        }
      });
    });

    syncCounter("reasonForSale");
    syncCounter("businessSummary");
    updateSellerStep(1);
  }

  function initBrowsePage() {
    var root = document.querySelector("[data-page='browse']");
    if (!root) {
      return;
    }
    hideBanner();
    var citySelect = document.querySelector("[data-filter-city]");
    var categorySelect = document.querySelector("[data-filter-category]");
    var cards = document.querySelector("[data-listings]");
    var meta = document.querySelector("[data-results-meta]");
    var pager = document.querySelector("[data-pagination]");
    var params = query();

    function load() {
      var filters = {
        city: params.get("city") || "",
        category: params.get("category") || "",
        page: params.get("page") || "1"
      };
      hideBanner();
      cards.setAttribute("aria-busy", "true");
      cards.innerHTML = loadingStateHtml("Loading listings...");
      meta.textContent = "Loading listings...";
      pager.innerHTML = "";
      getListings(filters).then(function(response) {
        if (!response.ok) {
          cards.innerHTML = "";
          meta.textContent = "";
          showBanner(response.error || "Unable to load listings.", "error");
          return;
        }
        renderFilterOptions(citySelect, response.filters.cities, filters.city, "All cities");
        renderFilterOptions(categorySelect, response.filters.categories, filters.category, "All categories");
        cards.innerHTML = response.items.length
          ? response.items.map(createListingCard).join("")
          : emptyStateHtml();
        meta.textContent = response.total + " live listing" + (response.total === 1 ? "" : "s");
        pager.innerHTML = renderPager(response.page, response.totalPages);
        lucideRefresh();
      }).catch(function(error) {
        cards.innerHTML = "";
        meta.textContent = "";
        pager.innerHTML = "";
        showBanner(error.message, "error");
      }).finally(function() {
        cards.removeAttribute("aria-busy");
      });
    }

    citySelect.addEventListener("change", function() {
      params.set("page", "1");
      if (citySelect.value) {
        params.set("city", citySelect.value);
      } else {
        params.delete("city");
      }
      updateQuery({
        city: citySelect.value,
        page: "1"
      });
      params = query();
      load();
    });

    categorySelect.addEventListener("change", function() {
      params.set("page", "1");
      if (categorySelect.value) {
        params.set("category", categorySelect.value);
      } else {
        params.delete("category");
      }
      updateQuery({
        category: categorySelect.value,
        page: "1"
      });
      params = query();
      load();
    });

    pager.addEventListener("click", function(event) {
      var target = event.target.closest("[data-page-link]");
      if (!target) {
        return;
      }
      event.preventDefault();
      updateQuery({ page: target.getAttribute("data-page-link") });
      params = query();
      load();
    });

    load();
  }

  function renderFilterOptions(select, values, selectedValue, defaultLabel) {
    if (!select) {
      return;
    }
    var options = ['<option value="">' + defaultLabel + "</option>"];
    values.forEach(function(value) {
      var optionValue = normalizeKey(value);
      options.push(
        '<option value="' + escapeHtml(optionValue) + '"' +
        (selectedValue === optionValue ? " selected" : "") +
        ">" + escapeHtml(value) + "</option>"
      );
    });
    select.innerHTML = options.join("");
  }

  function renderPager(page, totalPages) {
    var html = [];
    for (var index = 1; index <= totalPages; index += 1) {
      html.push(
        '<button data-page-link="' + index + '" class="' +
        (index === page
          ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          : "rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200") +
        '">' + index + "</button>"
      );
    }
    return html.join("");
  }

  function emptyStateHtml() {
    return [
      '<div class="panel-ring rounded-3xl bg-white p-10 text-center shadow-panel">',
      '<h3 class="text-xl font-semibold text-slate-900">No listings match these filters</h3>',
      '<p class="mt-3 text-sm leading-6 text-slate-600">Try another city or category, or go live with the first listing in your market.</p>',
      '<a data-seller-form-link href="' + sellerEntryHref() + '" class="mt-6 inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white">List my business</a>',
      "</div>"
    ].join("");
  }

  function initListingPage() {
    var root = document.querySelector("[data-page='listing']");
    if (!root) {
      return;
    }
    hideBanner();
    var listingId = query().get("id");
    var container = document.querySelector("[data-listing-detail]");
    var form = document.querySelector("[data-interest-form]");
    var buyerFieldNames = ["fullName", "mobile", "email", "city", "message", "brokerDeclaration", "buyerConsent"];
    if (!listingId) {
      showBanner("Missing listing id.", "error");
      return;
    }

    function getBuyerErrorNode(name) {
      return form ? form.querySelector('[data-buyer-error-for="' + name + '"]') : null;
    }

    function clearBuyerFieldError(field) {
      if (!field) {
        return;
      }
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
      var errorNode = getBuyerErrorNode(field.name);
      if (errorNode) {
        errorNode.textContent = "";
        errorNode.hidden = true;
      }
      if (field.name === "buyerConsent") {
        var consentRow = field.closest(".buyer-consent");
        if (consentRow) {
          consentRow.removeAttribute("aria-invalid");
        }
      }
    }

    function setBuyerFieldError(field, message) {
      clearBuyerFieldError(field);
      field.setCustomValidity(message);
      field.setAttribute("aria-invalid", "true");
      var errorNode = getBuyerErrorNode(field.name);
      if (errorNode) {
        errorNode.textContent = message;
        errorNode.hidden = false;
      }
      if (field.name === "buyerConsent") {
        var consentRow = field.closest(".buyer-consent");
        if (consentRow) {
          consentRow.setAttribute("aria-invalid", "true");
        }
      }
      if (typeof field.focus === "function") {
        field.focus();
      }
      return false;
    }

    function getBuyerFieldValue(name) {
      var field = form.elements[name];
      if (!field) {
        return "";
      }
      if (field.type === "checkbox") {
        return field.checked ? "yes" : "";
      }
      return String(field.value || "").trim();
    }

    function validateBuyerField(name) {
      var field = form.elements[name];
      if (!field) {
        return true;
      }

      clearBuyerFieldError(field);
      var value = getBuyerFieldValue(name);

      if (name === "buyerConsent") {
        return field.checked ? true : setBuyerFieldError(field, "Consent is required before we can send your enquiry.");
      }

      if (name === "fullName" && value.length < 2) {
        return setBuyerFieldError(field, "Enter your full name.");
      }

      if (name === "mobile" && !/^(?:\+91\s?)?[6-9]\d{9}$/.test(value)) {
        return setBuyerFieldError(field, "Enter a valid Indian mobile number.");
      }

      if (name === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return setBuyerFieldError(field, "Enter a valid email address.");
      }

      if (name === "city" && !value) {
        return setBuyerFieldError(field, "Enter your city.");
      }

      if (name === "message" && value.length < 20) {
        return setBuyerFieldError(field, "Enter a longer message for the seller.");
      }

      if (name === "brokerDeclaration" && value === "yes") {
        return setBuyerFieldError(field, "Only direct buyers can send enquiries.");
      }

      return true;
    }

    function validateBuyerForm() {
      for (var index = 0; index < buyerFieldNames.length; index += 1) {
        if (!validateBuyerField(buyerFieldNames[index])) {
          return false;
        }
      }
      return true;
    }

    getListing(listingId).then(function(response) {
      if (!response.ok) {
        showBanner(response.error || "Listing not found.", "error");
        return;
      }
      var listing = response.item;
      container.innerHTML = renderListingDetail(listing);
      form.hidden = false;
      form.setAttribute("data-listing-id", listing.listingId);
      document.title = listing.title + " | AglaOwner";
      lucideRefresh();
    }).catch(function(error) {
      showBanner(error.message, "error");
    });

    form.querySelectorAll("input, select, textarea").forEach(function(field) {
      var eventName = field.tagName === "SELECT" || field.type === "checkbox" ? "change" : "input";
      field.addEventListener(eventName, function() {
        clearBuyerFieldError(field);
      });
    });

    form.addEventListener("submit", function(event) {
      event.preventDefault();
      hideBanner();
      var submitButton = form.querySelector("button[type='submit']");
      if (!validateBuyerForm()) {
        return;
      }
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
      postViaIframe("interest", {
        listingId: form.getAttribute("data-listing-id"),
        fullName: form.fullName.value,
        mobile: form.mobile.value,
        email: form.email.value,
        city: form.city.value,
        budgetBand: form.budgetBand.value,
        purchaseTimeframe: form.purchaseTimeframe.value,
        message: form.message.value,
        brokerDeclaration: form.brokerDeclaration.value
      }).then(function(response) {
        showBanner(response.message, "success");
        form.reset();
        buyerFieldNames.forEach(function(name) {
          clearBuyerFieldError(form.elements[name]);
        });
      }).catch(function(error) {
        showBanner(error.message, "error");
      }).finally(function() {
        submitButton.disabled = false;
        submitButton.textContent = "Send enquiry";
      });
    });
  }

  function renderListingDetail(listing) {
    var proofSignals = (listing.proofSignals || []).map(function(item) {
      return '<span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">' + escapeHtml(item) + "</span>";
    }).join("");
    var links = [
      listing.googleMapsUrl ? '<a class="linkish text-sm font-medium text-slate-700" href="' + escapeHtml(listing.googleMapsUrl) + '" target="_blank" rel="noreferrer">Google Maps</a>' : "",
      listing.instagramUrl ? '<a class="linkish text-sm font-medium text-slate-700" href="' + escapeHtml(listing.instagramUrl) + '" target="_blank" rel="noreferrer">Instagram</a>' : "",
      listing.websiteUrl ? '<a class="linkish text-sm font-medium text-slate-700" href="' + escapeHtml(listing.websiteUrl) + '" target="_blank" rel="noreferrer">Website</a>' : ""
    ].filter(Boolean).join('<span class="text-slate-300">•</span>');
    return [
      '<div class="rounded-3xl bg-white p-8 shadow-panel panel-ring">',
      '<div class="flex flex-wrap items-start justify-between gap-4">',
      '<div>',
      '<p class="text-xs font-semibold uppercase tracking-wide text-orange-600">' + escapeHtml(listing.category) + "</p>",
      '<h1 class="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">' + escapeHtml(listing.title) + "</h1>",
      '<p class="mt-3 text-sm text-slate-500">' + escapeHtml(listing.locality || listing.city) + ", " + escapeHtml(listing.city) + "</p>",
      "</div>",
      '<span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">' + escapeHtml(listing.reviewBadge || "Reviewed") + "</span>",
      "</div>",
      '<p class="mt-6 text-base leading-7 text-slate-700">' + escapeHtml(listing.summary) + "</p>",
      '<div class="mt-6 flex flex-wrap gap-2">' + proofSignals + "</div>",
      '<div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">',
      infoTile("Asking price", listing.askingPriceBand),
      infoTile("Monthly revenue", listing.revenueBand),
      infoTile("Monthly profit", listing.profitBand),
      infoTile("Monthly rent", listing.rentBand),
      infoTile("Years running", listing.yearsRunning),
      infoTile("Current team", listing.staffBand),
      infoTile("Live till", formatDate(listing.expiresAt)),
      infoTile("Location", (listing.locality ? listing.locality + ", " : "") + listing.city),
      "</div>",
      '<div class="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">',
      '<section>',
      '<h2 class="text-lg font-semibold text-slate-900">Reason for sale</h2>',
      '<p class="mt-3 text-sm leading-7 text-slate-600">' + escapeHtml(listing.reasonForSale) + "</p>",
      '<h2 class="mt-8 text-lg font-semibold text-slate-900">Included in the sale</h2>',
      '<p class="mt-3 text-sm leading-7 text-slate-600">' + escapeHtml(listing.assetsIncluded) + "</p>",
      "</section>",
      '<aside class="rounded-3xl bg-slate-50 p-6">',
      '<h2 class="text-lg font-semibold text-slate-900">Public proof links</h2>',
      '<div class="mt-4 flex flex-wrap items-center gap-3">' + (links || '<span class="text-sm text-slate-500">Shared privately during review.</span>') + "</div>",
      '<p class="mt-6 text-xs leading-6 text-slate-500">Reviewed means owner contact and public presence were screened. It does not mean financial claims were audited.</p>',
      "</aside>",
      "</div>",
      "</div>"
    ].join("");
  }

  function initManagePage() {
    var root = document.querySelector("[data-page='manage']");
    if (!root) {
      return;
    }
    hideBanner();
    var listingId = query().get("id");
    var token = query().get("token");
    var detail = document.querySelector("[data-owner-detail]");
    var leads = document.querySelector("[data-owner-leads]");
    var actions = document.querySelector("[data-owner-actions]");
    var publicLink = document.querySelector("[data-owner-public-link]");
    if (!listingId || !token) {
      showBanner("Missing owner credentials.", "error");
      return;
    }
    if (publicLink) {
      publicLink.href = "listing.html?id=" + encodeURIComponent(listingId);
      publicLink.hidden = false;
    }
    getOwnerView(listingId, token).then(function(response) {
      if (!response.ok) {
        showBanner(response.error || "Unable to load owner dashboard.", "error");
        return;
      }
      detail.innerHTML = renderOwnerListing(response.listing);
      leads.innerHTML = renderOwnerLeads(response.leads);
      actions.hidden = false;
      actions.addEventListener("click", function(event) {
        var button = event.target.closest("[data-owner-action]");
        if (!button) {
          return;
        }
        var action = button.getAttribute("data-owner-action");
        button.disabled = true;
        postViaIframe("owner-action", {
          id: listingId,
          token: token,
          ownerAction: action
        }).then(function(result) {
          showBanner(result.message, "success");
        }).catch(function(error) {
          showBanner(error.message, "error");
        }).finally(function() {
          button.disabled = false;
        });
      });
    }).catch(function(error) {
      showBanner(error.message, "error");
    });
  }

  function renderOwnerListing(listing) {
    return [
      '<div class="rounded-3xl bg-white p-8 shadow-panel panel-ring">',
      '<p class="text-xs font-semibold uppercase tracking-wide text-orange-600">Owner dashboard</p>',
      '<h1 class="mt-2 text-3xl font-semibold text-slate-900">' + escapeHtml(listing.title) + "</h1>",
      '<dl class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">',
      infoTile("Status", listing.status),
      infoTile("City", listing.city),
      infoTile("Category", listing.category),
      infoTile("Expiry", formatDate(listing.expiresAt)),
      "</dl>",
      "</div>"
    ].join("");
  }

  function renderOwnerLeads(leads) {
    if (!leads.length) {
      return '<div class="rounded-3xl bg-white p-8 text-sm text-slate-600 shadow-panel panel-ring">No recent enquiries yet.</div>';
    }
    return leads.map(function(lead) {
      return [
        '<article class="rounded-3xl bg-white p-6 shadow-panel panel-ring">',
        '<div class="flex items-center justify-between gap-4">',
        '<h3 class="text-base font-semibold text-slate-900">' + escapeHtml(lead.buyerName) + "</h3>",
        '<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">' + escapeHtml(lead.deliveryStatus) + "</span>",
        "</div>",
        '<p class="mt-2 text-sm text-slate-500">' + escapeHtml(lead.buyerCity || "City not shared") + " • " + escapeHtml(lead.purchaseTimeframe || "Timeline not shared") + "</p>",
        '<p class="mt-4 text-sm leading-6 text-slate-700">' + escapeHtml(lead.message) + "</p>",
        '<p class="mt-4 text-xs text-slate-500">Received ' + escapeHtml(formatDate(lead.createdAt)) + "</p>",
        "</article>"
      ].join("");
    }).join("");
  }

  function lucideRefresh() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  document.addEventListener("DOMContentLoaded", function() {
    fillStaticLinks();
    initHomeSellerForm();
    initBrowsePage();
    initListingPage();
    initManagePage();
    lucideRefresh();
  });
})();
