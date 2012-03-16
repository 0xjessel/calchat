package model;

public class TermModel {
	private String name;
	private String year;
	private String updated;
	private ClassModel[] classes;

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getYear() {
		return year;
	}

	public void setYear(String year) {
		this.year = year;
	}

	public String getUpdated() {
		return updated;
	}

	public void setUpdated(String updated) {
		this.updated = updated;
	}

	public ClassModel[] getClasses() {
		return classes;
	}

	public void setClasses(ClassModel[] classes) {
		this.classes = classes;
	}

	public TermModel(String name, String year, String updated,
			ClassModel[] classes) {
		super();
		this.name = name;
		this.year = year;
		this.updated = updated;
		this.classes = classes;
	}

	@Override
	public String toString() {
		return String.format("TermModel: %s %s (%s)", name, year, updated);
	}
}
