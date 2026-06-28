from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import json, io, os
from api.optimizer import run_optimization
from api.exporter import export_excel, export_pdf

app = Flask(__name__)
CORS(app)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/optimize", methods=["POST"])
def optimize():
    data = request.get_json()
    try:
        result = run_optimization(data)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        import traceback
        return jsonify({"success": False, "error": str(e), "trace": traceback.format_exc()}), 400

@app.route("/api/export/excel", methods=["POST"])
def export_excel_route():
    data = request.get_json()
    buf = export_excel(data)
    return send_file(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     as_attachment=True, download_name="load_plan.xlsx")

@app.route("/api/export/pdf", methods=["POST"])
def export_pdf_route():
    data = request.get_json()
    buf = export_pdf(data)
    return send_file(buf, mimetype="application/pdf",
                     as_attachment=True, download_name="load_plan.pdf")

if __name__ == "__main__":
    app.run(debug=False, port=3000)
