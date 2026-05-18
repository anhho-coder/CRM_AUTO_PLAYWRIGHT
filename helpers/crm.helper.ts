import { Page } from '@playwright/test';

/**
 * CRM Lead data interface
 */
export interface CRMLeadData {
  leadName: string;
  state?: string;
  country?: string;
  salesTeam?: string;
  salesperson?: string;
  reseller?: string;
  distributor?: string;
  leadForm?: string;
  endUser?: string;
}

/**
 * CRM helper class for managing CRM Lead operations
 */
export class CRMHelper {
  constructor(private page: Page) {}

  /**
   * Navigates to CRM Lead creation form
   */
  async navigateToLeadForm(): Promise<void> {
    await this.page.goto(
      'https://sign-off.nakivo.site/web?#id=&action=152&model=crm.lead&view_type=form&menu_id=111'
    );
    
    // Wait for page loading to complete
    await this.page.getByText('Loading').first().waitFor({ state: 'hidden' });
  }

  /**
   * Fills CRM Lead form with provided data
   * @param leadData - CRM Lead data to fill in the form
   */
  async fillLeadForm(leadData: CRMLeadData): Promise<void> {
    // Fill Lead name
    await this.page.getByRole('textbox', { name: 'Lead Opportunity' }).fill(leadData.leadName);

    // Fill State if provided
    if (leadData.state) {
      await this.page.getByRole('textbox', { name: 'S t a t e' }).fill(leadData.state);
    }

    // Fill Country if provided
    if (leadData.country) {
      await this.page.getByRole('textbox', { name: 'C o u n t r y' }).fill(leadData.country);
    }

    // Select Sales Team if provided
    if (leadData.salesTeam) {
      await this.page.getByLabel('Sales Team').selectOption([leadData.salesTeam]);
    }

    // Change Salesperson if provided
    if (leadData.salesperson) {
      await this.page.getByRole('textbox', { name: 'Salesperson' }).click();
      await this.page.getByRole('textbox', { name: 'Salesperson' }).fill(leadData.salesperson);
    }

    // Select Reseller if provided
    if (leadData.reseller) {
      await this.page.getByRole('textbox', { name: 'Reseller', exact: true }).fill(leadData.reseller);
    }

    // Select Distributor if provided
    if (leadData.distributor) {
      await this.page.getByRole('textbox', { name: 'Distributor', exact: true }).fill(leadData.distributor);
    }

    // Click on Assigned Partner tab
    await this.page.getByRole('tab', { name: 'Assigned Partner' }).click();
  }

  /**
   * Saves the CRM Lead form
   */
  async saveLead(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save' }).click();
    await this.page.getByText('Creating a new record...').first().waitFor({ state: 'hidden' });
  }

  /**
   * Gets the created lead ID from URL
   * @returns Lead ID as string
   */
  getLeadId(): string {
    const url = this.page.url();
    const match = url.match(/id=(\d+)/);
    return match ? match[1] : '';
  }

  /**
   * Verifies lead was created successfully
   * @param leadName - Expected lead name
   */
  async verifyLeadCreated(leadName: string): Promise<boolean> {
    try {
      const title = await this.page.title();
      const hasCorrectTitle = title.includes(leadName);
      const hasId = this.getLeadId() !== '';
      return hasCorrectTitle && hasId;
    } catch {
      return false;
    }
  }

  /**
   * Gets the value of a field from the saved lead (view mode)
   * @param fieldName - Name of the field
   * @returns Field value as string
   */
  async getFieldValue(fieldName: string): Promise<string> {
    try {
      // Different approaches for different field types
      switch (fieldName.toLowerCase()) {
        case 'leadname':
        case 'lead name':
          const heading = await this.page.getByRole('heading', { level: 1 }).first().textContent();
          return heading?.trim() || '';
        
        case 'salesperson':
          const salesperson = await this.page.locator('text=Salesperson').locator('..').locator('..').locator('td').nth(1).textContent();
          return salesperson?.trim() || '';
        
        case 'salesteam':
        case 'sales team':
          const salesTeam = await this.page.locator('text=Sales Team').locator('..').locator('..').locator('td').nth(1).textContent();
          return salesTeam?.trim() || '';
        
        case 'leadsource':
        case 'lead source':
          const leadSource = await this.page.locator('text=Lead Source').locator('..').locator('..').locator('td').nth(1).textContent();
          return leadSource?.trim() || '';
        
        default:
          return '';
      }
    } catch {
      return '';
    }
  }

  /**
   * Verifies all filled fields after save
   * @param leadData - Original lead data that was filled
   * @returns Object with verification results for each field
   */
  async verifyAllFields(leadData: CRMLeadData): Promise<{[key: string]: boolean}> {
    const results: {[key: string]: boolean} = {};
    
    // Verify lead name
    const actualLeadName = await this.getFieldValue('leadname');
    results['leadName'] = actualLeadName === leadData.leadName;
    
    // Verify Sales Team if provided
    if (leadData.salesTeam) {
      const actualSalesTeam = await this.getFieldValue('salesteam');
      results['salesTeam'] = actualSalesTeam === leadData.salesTeam;
    }
    
    // Verify Salesperson if provided
    if (leadData.salesperson) {
      const actualSalesperson = await this.getFieldValue('salesperson');
      results['salesperson'] = actualSalesperson.includes(leadData.salesperson);
    }
    
    // Verify Lead Source (auto-set to "Partner" when Sales Team is selected)
    const actualLeadSource = await this.getFieldValue('leadsource');
    results['leadSource'] = actualLeadSource.length > 0;
    
    return results;
  }
}
