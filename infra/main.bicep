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

@description('Full Azure OpenAI review endpoint.')
param aiReviewEndpoint string = ''

@description('Full Azure OpenAI image generation endpoint.')
param aiImageEndpoint string = ''

@secure()
@description('Azure OpenAI or Azure AI Services key used by the Function App for review and image-generation calls.')
param aiApiKey string = ''

@description('Azure AI Content Safety resource endpoint.')
param contentSafetyEndpoint string = ''

@secure()
@description('Azure AI Content Safety key used by the Function App.')
param contentSafetyKey string = ''

@description('Approved image moderation endpoint.')
param imageModerationEndpoint string = ''

@secure()
@description('Image moderation API key used by the Function App.')
param imageModerationKey string = ''

@description('Event-owner approved legal footer.')
param approvedFooterText string

@description('Consent text version.')
param consentVersion string

@description('Server-controlled Blob prefix for this event, without leading or trailing slashes.')
param blobPathPrefix string

@description('AI review deployment name for operational inventory.')
param aiReviewDeploymentName string = ''

@description('AI image deployment name for operational inventory.')
param aiImageDeploymentName string = ''

var suffix = uniqueString(resourceGroup().id, environment)
var storageName = take('rmhecard${environment}${suffix}', 24)
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
    allowSharedKeyAccess: true
    defaultToOAuthAuthentication: false
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
              prefixMatch: ['${containerName}/${blobPathPrefix}/', '${containerName}/idempotency/']
            }
          }
        }
      ]
    }
  }
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net'

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: environment == 'prod' ? 'Enabled' : 'Disabled'
  }
}

resource staticWebAppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    FUNCTIONS_EXTENSION_VERSION: '~4'
    FUNCTIONS_WORKER_RUNTIME: 'node'
    AzureWebJobsStorage: storageConnectionString
    STORAGE_CONNECTION_STRING: storageConnectionString
    STORAGE_CONTAINER: containerName
    BLOB_PATH_PREFIX: blobPathPrefix
    ALLOWED_ORIGINS: join(allowedOrigins, ',')
    CONSENT_VERSION: consentVersion
    MAX_UPLOAD_BYTES: '5000000'
    IDEMPOTENCY_PENDING_SECONDS: '300'
    SUPPORTED_LANGUAGES: 'en,es,fr,pt,ar,he'
    AI_REVIEW_ENABLED: string(aiReviewEnabled)
    AI_IMAGE_ENABLED: string(aiImageEnabled)
    AI_REVIEW_ENDPOINT: aiReviewEndpoint
    AI_IMAGE_ENDPOINT: aiImageEndpoint
    AI_API_KEY: aiApiKey
    AI_REVIEW_DEPLOYMENT_NAME: aiReviewDeploymentName
    AI_IMAGE_DEPLOYMENT_NAME: aiImageDeploymentName
    CONTENT_SAFETY_ENDPOINT: contentSafetyEndpoint
    CONTENT_SAFETY_KEY: contentSafetyKey
    IMAGE_MODERATION_ENDPOINT: imageModerationEndpoint
    IMAGE_MODERATION_KEY: imageModerationKey
    CONTENT_SAFETY_THRESHOLD: '2'
    APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
    TELEMETRY_ENABLED: 'true'
  }
}

output staticWebAppHostname string = staticWebApp.properties.defaultHostname
output staticWebAppResourceName string = staticWebApp.name
output storageAccountName string = storage.name
output approvedFooter string = approvedFooterText
