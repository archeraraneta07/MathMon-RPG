"""Deploy the MathMon classifier to an Azure ML managed online endpoint.

Required environment variables:
    AZURE_SUBSCRIPTION_ID
    AZURE_RESOURCE_GROUP
    AZURE_ML_WORKSPACE
    AZURE_ML_ENDPOINT

Authenticate first with ``az login``. The command packages the locally trained
joblib model and publishes the same feature contract used by the Flask API.
"""

import os
from pathlib import Path

from azure.ai.ml import MLClient
from azure.ai.ml.entities import (
    CodeConfiguration,
    Environment,
    ManagedOnlineDeployment,
    ManagedOnlineEndpoint,
    Model,
    OnlineRequestSettings,
)
from azure.identity import DefaultAzureCredential


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / 'mathmon_model.joblib'
SCORING_PATH = ROOT / 'azure_ml_score.py'


def required(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def deploy():
    """Create or update the MathMon managed online endpoint."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError('Train the model first: python ml_model.py train')

    client = MLClient(
        DefaultAzureCredential(),
        subscription_id=required('AZURE_SUBSCRIPTION_ID'),
        resource_group_name=required('AZURE_RESOURCE_GROUP'),
        workspace_name=required('AZURE_ML_WORKSPACE'),
    )
    endpoint_name = required('AZURE_ML_ENDPOINT')

    endpoint = ManagedOnlineEndpoint(
        name=endpoint_name,
        description='MathMon mathematics performance classification endpoint',
        auth_mode='key',
    )
    client.online_endpoints.begin_create_or_update(endpoint).result()

    model = Model(path=str(MODEL_PATH), name='mathmon-classifier', version='1')
    environment = Environment(
        name='mathmon-classifier-env',
        image='mcr.microsoft.com/azureml/minimal-ubuntu22.04-py39-cpu-inference:latest',
        conda_file={
            'name': 'mathmon',
            'channels': ['conda-forge'],
            'dependencies': [
                'python=3.9',
                {'pip': ['pandas', 'numpy', 'scikit-learn', 'joblib']},
            ],
        },
    )
    deployment = ManagedOnlineDeployment(
        name='blue',
        endpoint_name=endpoint_name,
        model=model,
        environment=environment,
        code_configuration=CodeConfiguration(
            code=str(ROOT),
            scoring_script=SCORING_PATH.name,
        ),
        instance_type='Standard_DS3_v2',
        instance_count=1,
        request_settings=OnlineRequestSettings(request_timeout_ms=10000),
    )
    client.online_deployments.begin_create_or_update(deployment).result()
    endpoint.traffic = {'blue': 100}
    client.online_endpoints.begin_create_or_update(endpoint).result()
    print(f'Azure ML endpoint deployed: {endpoint_name}')


if __name__ == '__main__':
    deploy()
