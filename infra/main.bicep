targetScope = 'resourceGroup'

@allowed(['dev', 'test', 'prod'])
param environment string

@description('Azure region for regional resources.')
param location string = resourceGroup().location

@description('Globally unique Static Web App name.')
param staticWebAppName string

@description('Allowed browser origins. Do not use wildcards in production.')
param allowedOrigins array

@minValue(1)
@description('Event-owner approved number of days to retain submitted cards.')
param retentionDays int

@description('Enable optional AI message review.')
param aiReviewEnabled bool = false

@description('Enable optional AI image generation.')
param aiImageEnabled bool = false

@description('Full managed-identity-enabled Foundry/Azure OpenAI review endpoint.')
param aiReviewEndpoint string = ''

@description('Full managed-identity-enabled image generation endpoint.')
param aiImageEndpoint string = ''

@description('Azure AI Content Safety resource endpoint.')
param contentSafetyEndpoint string = ''

@description('Approved managed-identity image moderation endpoint.')
param imageModerationEndpoint string = ''

@description('Event-owner approved legal footer.')
param approvedFooterText string

@description('Consent text version.')
param consentVersion string

@description('AI review deployment name for operational inventory.')
param aiReviewDeploymentName string = ''

@description('AI image deployment name for operational inventory.')
param aiImageDeploymentName string = ''

var suffix = uniqueString(resourceGroup().id, environment)
var storageName = take('rmhecard${environment}${suffix}', 24)
var functionName = 'rmh-ecard-${environment}-${suffix}'
var containerName = 'cards'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'rmh-ecard-${environment}-logs'
  location: location
  properties: {
    retentionInDays: retentionDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'rmh-ecard-${environment}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableIpMasking: false
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: retentionDays
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: retentionDays
    }
  }
}

resource cards 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
    metadata: {
      purpose: 'rmh-words-of-encouragement-2026'
    }
  }
}

resource retention 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          enabled: true
          name: 'event-card-retention'
          type: 'Lifecycle'
          definition: {
            actions: {
              baseBlob: {
                delete: {
                  daysAfterModificationGreaterThan: retentionDays
                }
              }
            }
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['${containerName}/2026/10/16/cards/', '${containerName}/idempotency/']
            }
          }
        }
      ]
    }
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'rmh-ecard-${environment}-plan'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|22'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      cors: {
        allowedOrigins: allowedOrigins
        supportCredentials: false
      }
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'STORAGE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
        { name: 'STORAGE_CONTAINER', value: containerName }
        { name: 'ALLOWED_ORIGINS', value: join(allowedOrigins, ',') }
        { name: 'CONSENT_VERSION', value: consentVersion }
        { name: 'MAX_UPLOAD_BYTES', value: '5000000' }
        { name: 'SUPPORTED_LANGUAGES', value: 'en,es,fr,pt,ar,he' }
        { name: 'AI_REVIEW_ENABLED', value: string(aiReviewEnabled) }
        { name: 'AI_IMAGE_ENABLED', value: string(aiImageEnabled) }
        { name: 'AI_REVIEW_ENDPOINT', value: aiReviewEndpoint }
        { name: 'AI_IMAGE_ENDPOINT', value: aiImageEndpoint }
        { name: 'AI_REVIEW_DEPLOYMENT_NAME', value: aiReviewDeploymentName }
        { name: 'AI_IMAGE_DEPLOYMENT_NAME', value: aiImageDeploymentName }
        { name: 'CONTENT_SAFETY_ENDPOINT', value: contentSafetyEndpoint }
        { name: 'IMAGE_MODERATION_ENDPOINT', value: imageModerationEndpoint }
        { name: 'CONTENT_SAFETY_THRESHOLD', value: '2' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'TELEMETRY_ENABLED', value: 'true' }
      ]
    }
  }
}

resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, 'blob-data-contributor')
  scope: storage
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: environment == 'prod' ? 'Standard' : 'Free'
    tier: environment == 'prod' ? 'Standard' : 'Free'
  }

  resource linkedApi 'linkedBackends@2023-12-01' = {
    name: 'function-api'
    properties: {
      backendResourceId: functionApp.id
      region: location
    }
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: environment == 'prod' ? 'Enabled' : 'Disabled'
  }
}

output functionAppName string = functionApp.name
output staticWebAppHostname string = staticWebApp.properties.defaultHostname
output staticWebAppResourceName string = staticWebApp.name
output storageAccountName string = storage.name
output approvedFooter string = approvedFooterText
