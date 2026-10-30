"""Train the MathMon adaptive-difficulty model as an Azure Machine Learning job.

Runs ``adaptive_model.py train`` on Azure ML compute with a CSV of attempts
(download it first: ``python adaptive_model.py fetch --api <url> --out attempts.csv``).
The trained ``adaptive_weights.json`` is stored as the job's output; download it
from the job page (or ``az ml job download``) and publish it with
``python adaptive_model.py publish --weights adaptive_weights.json --api <url>``.

Required environment variables:
    AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, AZURE_ML_WORKSPACE
Optional:
    AZURE_ML_COMPUTE (default: cpu-cluster)

Usage:
    python azure_ml_train_job.py --csv attempts.csv
"""

import argparse
import os
from pathlib import Path

from azure.ai.ml import Input, MLClient, Output, command
from azure.identity import DefaultAzureCredential

ROOT = Path(__file__).resolve().parent


def required(name):
    """Read a required environment variable."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def submit(csv_path):
    """Submit the training job and return its Azure ML studio URL."""
    client = MLClient(
        DefaultAzureCredential(),
        subscription_id=required('AZURE_SUBSCRIPTION_ID'),
        resource_group_name=required('AZURE_RESOURCE_GROUP'),
        workspace_name=required('AZURE_ML_WORKSPACE'),
    )
    job = command(
        code=str(ROOT),
        command='python adaptive_model.py train --csv ${{inputs.attempts}} --out ${{outputs.model}}/adaptive_weights.json',
        inputs={'attempts': Input(type='uri_file', path=str(Path(csv_path).resolve()))},
        outputs={'model': Output(type='uri_folder')},
        environment='azureml://registries/azureml/environments/sklearn-1.5/labels/latest',
        compute=os.getenv('AZURE_ML_COMPUTE', 'cpu-cluster'),
        display_name='mathmon-adaptive-difficulty',
        experiment_name='mathmon-adaptive',
    )
    submitted = client.jobs.create_or_update(job)
    print(f'Submitted job {submitted.name}: {submitted.studio_url}')
    return submitted.studio_url


def main():
    parser = argparse.ArgumentParser(description='Train the adaptive model on Azure ML')
    parser.add_argument('--csv', required=True, help='attempts CSV (FEATURES + correct)')
    submit(parser.parse_args().csv)


if __name__ == '__main__':
    main()
