targetScope = 'resourceGroup'

@allowed(['dev', 'test', 'prod'])
param environment string

@description('Azure region for regional resources.')
param location string = resourceGroup().location

@description('Globally unique Static Web App name.')
param staticWebAppName string

@description('Globally unique dedicated Function App name.')
param functionAppName string = '${take(staticWebAppName, 50)}-api'

@description('GitHub repository trusted to deploy the production Function App through OIDC.')
param githubRepository string = 'dsanchezcr/RonaldMcDonaldHouse'

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
var functionDeploymentContainerName = 'function-packages'

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

resource functionDeploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: functionDeploymentContainerName
  properties: {
    publicAccess: 'None'
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

resource functionPlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${functionAppName}-plan'
  location: location
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: functionPlan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${functionDeploymentContainerName}'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'DEPLOYMENT_STORAGE_CONNECTION_STRING'
          }
        }
      }
      runtime: {
        name: 'node'
        version: '22'
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 2048
        maximumInstanceCount: 20
      }
    }
    siteConfig: {
      cors: {
        allowedOrigins: union(allowedOrigins, [
          'https://${staticWebApp.properties.defaultHostname}'
          'https://*.2.azurestaticapps.net'
        ])
        supportCredentials: false
      }
    }
  }
}

resource functionAppSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    FUNCTIONS_EXTENSION_VERSION: '~4'
    AzureWebJobsStorage: storageConnectionString
    DEPLOYMENT_STORAGE_CONNECTION_STRING: storageConnectionString
    STORAGE_CONNECTION_STRING: storageConnectionString
    STORAGE_CONTAINER: containerName
    BLOB_PATH_PREFIX: blobPathPrefix
    ALLOWED_ORIGINS: join(union(allowedOrigins, ['https://${staticWebApp.properties.defaultHostname}']), ',')
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
    IMAGE_MODERATION_ENDPOINT: empty(imageModerationEndpoint) ? 'https://${functionApp.properties.defaultHostName}/api/moderate-image' : imageModerationEndpoint
    IMAGE_MODERATION_KEY: imageModerationKey
    CONTENT_SAFETY_THRESHOLD: '2'
    APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
    TELEMETRY_ENABLED: 'true'
  }
}

resource githubDeploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${functionAppName}-github-deploy'
  location: location
}

resource githubProductionFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: githubDeploymentIdentity
  name: 'github-production'
  properties: {
    audiences: ['api://AzureADTokenExchange']
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:environment:production'
  }
}

resource githubFunctionDeploymentRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionApp.id, githubDeploymentIdentity.id, 'Website Contributor')
  scope: functionApp
  properties: {
    principalId: githubDeploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'de139f84-1756-47ae-9be6-808fbbe84772')
  }
}

output staticWebAppHostname string = staticWebApp.properties.defaultHostname
output staticWebAppResourceName string = staticWebApp.name
output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output githubDeploymentClientId string = githubDeploymentIdentity.properties.clientId
output storageAccountName string = storage.name
output approvedFooter string = approvedFooterText
