# Add Sitelinks Form to Frontend

## Context

The Sitelinks feature is implemented in the backend (`server.js`) but there's no form in the frontend (`public/index.html`) to collect sitelink data.

---

## TODOs

- [x] 1. Add Sitelinks HTML section (after Callouts, before Lead Form)

  **Location**: public/index.html, after line 895 (after the Callouts section closing `</div>`)

  **Insert this HTML**:
  ```html
      <!-- SECTION: Sitelinks -->
      <div class="form-section">
        <div class="section-title">
          SITELINKS
          <span class="badge optional">OPTIONAL</span>
        </div>
        <div id="sitelinks-container" class="dynamic-fields">
          <div class="sitelink-item" style="border:1px solid #ddd; padding:12px; border-radius:4px; margin-bottom:8px;">
            <div class="grid">
              <div>
                <label>Link Text</label>
                <input type="text" class="sitelink-text" maxlength="25" placeholder="About Us" value="About Us" oninput="updateCharCounter(this, 25)">
                <span class="char-counter">8/25</span>
              </div>
              <div>
                <label>Final URL</label>
                <input type="url" class="sitelink-url" placeholder="https://example.com/about" value="https://example.com/about">
              </div>
            </div>
            <div class="grid" style="margin-top:8px;">
              <div>
                <label>Description Line 1 (optional)</label>
                <input type="text" class="sitelink-desc1" maxlength="35" placeholder="Learn more about us" value="Learn more about our company" oninput="updateCharCounter(this, 35)">
                <span class="char-counter">28/35</span>
              </div>
              <div>
                <label>Description Line 2 (optional)</label>
                <input type="text" class="sitelink-desc2" maxlength="35" placeholder="Our story and mission" value="Our story and values" oninput="updateCharCounter(this, 35)">
                <span class="char-counter">20/35</span>
              </div>
            </div>
          </div>
          <div class="sitelink-item" style="border:1px solid #ddd; padding:12px; border-radius:4px; margin-bottom:8px;">
            <div class="grid">
              <div>
                <label>Link Text</label>
                <input type="text" class="sitelink-text" maxlength="25" placeholder="Contact" value="Contact Us" oninput="updateCharCounter(this, 25)">
                <span class="char-counter">10/25</span>
              </div>
              <div>
                <label>Final URL</label>
                <input type="url" class="sitelink-url" placeholder="https://example.com/contact" value="https://example.com/contact">
              </div>
            </div>
            <div class="grid" style="margin-top:8px;">
              <div>
                <label>Description Line 1 (optional)</label>
                <input type="text" class="sitelink-desc1" maxlength="35" placeholder="Get in touch with us" value="Get in touch with our team" oninput="updateCharCounter(this, 35)">
                <span class="char-counter">26/35</span>
              </div>
              <div>
                <label>Description Line 2 (optional)</label>
                <input type="text" class="sitelink-desc2" maxlength="35" placeholder="We're here to help" value="We respond within 24 hours" oninput="updateCharCounter(this, 35)">
                <span class="char-counter">26/35</span>
              </div>
            </div>
          </div>
        </div>
        <button type="button" class="add-field-btn" onclick="addSitelink()">+ Add Sitelink</button>
      </div>
  ```

  **Commit**: NO (group with task 3)

- [x] 2. Add addSitelink() JavaScript function

  **Location**: public/index.html, in the `<script>` section, after the addCallout() function (around line 2420)

  **Find** (the addCallout function ends around line 2430):
  ```javascript
    function addCallout() {
      // ... existing code
    }
  ```

  **Add after it**:
  ```javascript
    function addSitelink() {
      const container = document.getElementById('sitelinks-container');
      const newItem = document.createElement('div');
      newItem.className = 'sitelink-item';
      newItem.style = 'border:1px solid #ddd; padding:12px; border-radius:4px; margin-bottom:8px;';
      newItem.innerHTML = `
        <div class="grid">
          <div>
            <label>Link Text</label>
            <input type="text" class="sitelink-text" maxlength="25" placeholder="Link Text" oninput="updateCharCounter(this, 25)">
            <span class="char-counter">0/25</span>
          </div>
          <div>
            <label>Final URL</label>
            <input type="url" class="sitelink-url" placeholder="https://example.com/page">
          </div>
        </div>
        <div class="grid" style="margin-top:8px;">
          <div>
            <label>Description Line 1 (optional)</label>
            <input type="text" class="sitelink-desc1" maxlength="35" placeholder="Description line 1" oninput="updateCharCounter(this, 35)">
            <span class="char-counter">0/35</span>
          </div>
          <div>
            <label>Description Line 2 (optional)</label>
            <input type="text" class="sitelink-desc2" maxlength="35" placeholder="Description line 2" oninput="updateCharCounter(this, 35)">
            <span class="char-counter">0/35</span>
          </div>
        </div>
        <button type="button" onclick="this.parentElement.remove()" style="margin-top:8px;background:#dc3545;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">Remove</button>
      `;
      container.appendChild(newItem);
    }
  ```

  **Commit**: NO (group with task 3)

- [x] 3. Add sitelinks collection to gatherOptionalExtensions()

  **Location**: public/index.html, in the gatherOptionalExtensions function (around line 2523-2525)

  **Find** (after callouts collection):
  ```javascript
      if (callouts.length > 0) {
        data.callouts = callouts;
      }
      
      const leadBusiness = document.getElementById('lead-business').value.trim();
  ```

  **Replace with**:
  ```javascript
      if (callouts.length > 0) {
        data.callouts = callouts;
      }
      
      // Collect sitelinks
      const sitelinkItems = document.querySelectorAll('.sitelink-item');
      const sitelinks = [];
      sitelinkItems.forEach(item => {
        const text = item.querySelector('.sitelink-text').value.trim();
        const url = item.querySelector('.sitelink-url').value.trim();
        if (text && url) {
          const sitelink = {
            text,
            finalUrl: url
          };
          const desc1 = item.querySelector('.sitelink-desc1')?.value.trim();
          const desc2 = item.querySelector('.sitelink-desc2')?.value.trim();
          if (desc1) sitelink.description1 = desc1;
          if (desc2) sitelink.description2 = desc2;
          sitelinks.push(sitelink);
        }
      });
      if (sitelinks.length > 0) {
        data.sitelinks = sitelinks;
      }
      
      const leadBusiness = document.getElementById('lead-business').value.trim();
  ```

  **Commit**: YES
  - Message: `feat(frontend): add Sitelinks form section`
  - Files: public/index.html
