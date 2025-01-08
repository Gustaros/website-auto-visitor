document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveSiteBtn");
  const listEl = document.getElementById("savedSites");

  // Load and display saved sites
  chrome.storage.local.get({ sitesToVisit: [] }, data => {
    data.sitesToVisit.forEach(site => {
      const li = document.createElement("li");
      li.textContent = site;
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => {
        const newSites = data.sitesToVisit.filter(s => s !== site);
        chrome.storage.local.set({ sitesToVisit: newSites }, () => {
          li.remove();
          data.sitesToVisit = newSites; // Update local copy
        });
      });
      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  });

  // Save current site
  saveBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const currentUrl = tabs[0].url;
      chrome.storage.local.get({ sitesToVisit: [] }, data => {
        const updatedSites = [...data.sitesToVisit, currentUrl];
        chrome.storage.local.set({ sitesToVisit: updatedSites }, () => {
          // Optionally update the UI
          const li = document.createElement("li");
          li.textContent = currentUrl;
          listEl.appendChild(li);
        });
      });
    });
  });

  const manageBtn = document.getElementById("manageSitesBtn");
  const managePanel = document.getElementById("managePanel");

  manageBtn.addEventListener("click", () => {
    managePanel.style.display = managePanel.style.display === "none"
      ? "block"
      : "none";
  });
});