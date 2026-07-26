Restaurant POS Sync — Chrome Extension v7
==========================================

WHAT IT DOES
- Choose Zomato or Swiggy in the popup
- 4 sync buttons: Outlets / Menu / Inventory / Orders
- Auto-Pull mode polls every minute for new orders

HOW TO INSTALL (Chrome)
1. Open chrome://extensions
2. Toggle "Developer mode" (top right)
3. Click "Load unpacked"
4. Select this folder

REQUIREMENTS
- Be logged into https://www.zomato.com/partners or https://partner.swiggy.com
- The CRM endpoint defaults to the live deployment; change it in the popup if self-hosting

ICON
The icon next to the URL bar opens the popup. Choose a platform, then click a sync button.

DATA FLOW
- Outlets → POST /api/external-outlets → creates "shops" in CRM
- Menu → POST /api/external-menu → creates [platform-prefixed] menu items
- Inventory → POST /api/external-inventory → creates inventory_items
- Orders → POST /api/external-order → creates orders + auto-KOT
