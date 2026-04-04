const menuButton = document.querySelector("[data-menu-btn]");
const navLinks = document.querySelector("[data-nav]");
const authUiBlocks = document.querySelectorAll("[data-auth-ui]");

document.body.classList.add("page-preload");

const hasAuthToken = () => Boolean(localStorage.getItem("flamecore_token"));

const syncNavAuthLinks = () => {
  const navSignIn = document.querySelectorAll('[data-nav] a[href="login.html"]');
  const navSignUp = document.querySelectorAll('[data-nav] a[href="signup.html"]');

  navSignIn.forEach((link) => {
    link.style.display = "none";
  });
  navSignUp.forEach((link) => {
    link.style.display = "none";
  });
};

const syncAuthUi = () => {
  const authenticated = hasAuthToken();
  authUiBlocks.forEach((block) => {
    block.classList.toggle("is-authenticated", authenticated);
  });
  syncNavAuthLinks();
};

const logoutEverywhere = async () => {
  const API = "http://localhost:5000";
  try {
    await fetch(`${API}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch {
    // Ignore network errors; local cleanup still logs out the user.
  }

  localStorage.removeItem("flamecore_token");
  localStorage.removeItem("flamecore_user");
  syncAuthUi();
  window.location.href = "index.html";
};

document.querySelectorAll("[data-auth-logout]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    logoutEverywhere();
  });
});

syncAuthUi();

if (menuButton && navLinks) {
  menuButton.addEventListener("click", () => {
    const expanded = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!expanded));
    navLinks.classList.toggle("open");
  });
}

const currentPath = window.location.pathname.split("/").pop() || "index.html";
const navAnchors = document.querySelectorAll("[data-nav] a");
const topSections = Array.from(document.querySelectorAll("main > section"));
const motionItems = Array.from(
  document.querySelectorAll(
    "main .section-kicker, main h1, main h2, main h3, main p, main li, main .card, main .product-panel, main .media-card, main .story-panel, main .slide-card, main .testimonial-card, main .trust-item, main .cta, main img, main a.btn, main form, main .console-panel, main .signal-item"
  )
);

const directionClasses = ["motion-left", "motion-right", "motion-up", "motion-scale"];

topSections.forEach((section, index) => {
  section.classList.add("scene-block", "scene-out");
  section.style.setProperty("--section-delay", `${index * 0.12}s`);
});

motionItems.forEach((element, index) => {
  element.classList.add("motion-item", "item-out", directionClasses[index % directionClasses.length]);
});

const animateSection = (section, isEntering) => {
  const sectionItems = Array.from(section.querySelectorAll(".motion-item"));
  sectionItems.forEach((element, index) => {
    element.style.setProperty("--item-delay", `${Math.min(index * 0.02, 0.18)}s`);
    if (isEntering) {
      element.classList.remove("item-out");
      element.classList.add("item-in");
    } else {
      element.classList.remove("item-in");
      element.classList.add("item-out");
    }
  });

  if (isEntering) {
    section.classList.remove("scene-out");
    section.classList.add("scene-in");
  } else {
    section.classList.remove("scene-in");
    section.classList.add("scene-out");
  }
};

const primePageIntro = () => {
  topSections.forEach((section, index) => {
    window.setTimeout(() => {
      animateSection(section, true);
    }, index * 65);
  });
};

navAnchors.forEach((anchor) => {
  const target = anchor.getAttribute("href");
  if (target === currentPath) {
    anchor.classList.add("active");
  }
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        animateSection(entry.target, entry.isIntersecting);
      });
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -5% 0px"
    }
  );

  topSections.forEach((section) => observer.observe(section));
} else {
  topSections.forEach((section) => {
    section.classList.remove("scene-out");
    section.classList.add("scene-in");
    Array.from(section.querySelectorAll(".motion-item")).forEach((item) => {
      item.classList.remove("item-out");
      item.classList.add("item-in");
    });
  });
}

const yearEl = document.querySelector("[data-year]");
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

const storyPanels = Array.from(document.querySelectorAll(".story-panel"));
let storyFlowTicking = false;

const updateStoryFlow = () => {
  const viewportHeight = window.innerHeight || 1;
  storyPanels.forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    const center = rect.top + rect.height * 0.5;
    const progress = (center - viewportHeight * 0.5) / (viewportHeight * 0.5);
    const clamped = Math.max(-1, Math.min(1, progress));
    const direction = panel.classList.contains("reverse") ? -1 : 1;
    const shift = -clamped * 34 * direction;
    panel.style.setProperty("--story-shift", `${shift.toFixed(2)}px`);
  });
  storyFlowTicking = false;
};

const requestStoryFlowUpdate = () => {
  if (!storyFlowTicking) {
    storyFlowTicking = true;
    window.requestAnimationFrame(updateStoryFlow);
  }
};

if (storyPanels.length) {
  window.addEventListener("scroll", requestStoryFlowUpdate, { passive: true });
  window.addEventListener("resize", requestStoryFlowUpdate);
  requestStoryFlowUpdate();
}

const markPageReady = () => {
  requestAnimationFrame(() => {
    document.body.classList.remove("page-preload");
    document.body.classList.add("page-ready");
    primePageIntro();
  });
};

if (document.readyState === "complete") {
  markPageReady();
} else {
  window.addEventListener("load", markPageReady, { once: true });
}

const internalPageLinks = document.querySelectorAll('a[href$=".html"]');
internalPageLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const href = link.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }

    if (href === currentPath) {
      return;
    }

    event.preventDefault();
    document.body.classList.add("page-exit");
    window.setTimeout(() => {
      window.location.href = href;
    }, 260);
  });
});

// 3D tilt interaction disabled to keep rendering stable across devices.
